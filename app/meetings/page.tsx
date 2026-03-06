"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Meeting = {
  id: string;
  title: string | null;
  meeting_date: string | null;
  created_at?: string | null;
};

function formatMeetingDate(dateStr: string | null) {
  if (!dateStr) return "No date";

  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;

  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function MeetingsPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadMeetings() {
    setLoading(true);

    const { data, error } = await supabase
      .from("meetings")
      .select("id,title,meeting_date,created_at")
      .order("meeting_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false });

    if (error) {
      console.error("Error loading meetings:", error);
      setMeetings([]);
    } else {
      setMeetings(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session?.user) {
        setCheckingAuth(false);
        await loadMeetings();
        return;
      }

      // Give Supabase a brief chance to restore session after redirect
      setTimeout(async () => {
        const {
          data: { session: retrySession },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (retrySession?.user) {
          setCheckingAuth(false);
          await loadMeetings();
        } else {
          router.replace("/login?redirectTo=/meetings");
        }
      }, 500);
    }

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;

      if (session?.user) {
        setCheckingAuth(false);
        await loadMeetings();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  async function handleDeleteMeeting(meetingId: string) {
    const confirmed = window.confirm(
      "Are you sure you want to delete this meeting?\n\nThis will also delete its races, entries, and tests."
    );

    if (!confirmed) return;

    setDeletingId(meetingId);

    try {
      const { data: races, error: racesFetchError } = await supabase
        .from("races")
        .select("id")
        .eq("meeting_id", meetingId);

      if (racesFetchError) throw racesFetchError;

      const raceIds = (races || []).map((r) => r.id);

      const { error: testsDeleteError } = await supabase
        .from("tests")
        .delete()
        .eq("meeting_id", meetingId);

      if (testsDeleteError) throw testsDeleteError;

      if (raceIds.length > 0) {
        const { error: entriesDeleteError } = await supabase
          .from("entries")
          .delete()
          .in("race_id", raceIds);

        if (entriesDeleteError) throw entriesDeleteError;

        const { error: racesDeleteError } = await supabase
          .from("races")
          .delete()
          .eq("meeting_id", meetingId);

        if (racesDeleteError) throw racesDeleteError;
      }

      const { data: deletedMeeting, error: meetingDeleteError } = await supabase
        .from("meetings")
        .delete()
        .eq("id", meetingId)
        .select("id");

      if (meetingDeleteError) throw meetingDeleteError;

      if (!deletedMeeting || deletedMeeting.length === 0) {
        throw new Error(
          "Meeting row was not deleted. This is usually an RLS policy issue or the row no longer matched the delete condition."
        );
      }

      setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
      router.refresh();
    } catch (error) {
      console.error("Delete meeting failed:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to delete meeting. Check console for details."
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (checkingAuth) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-sm text-muted-foreground">Checking login...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Meetings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your imported race meetings
          </p>
        </div>

        <Button onClick={() => router.push("/meetings/new")}>
          New Meeting
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading meetings...</div>
      ) : meetings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No meetings found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {meetings.map((meeting) => (
            <Card key={meeting.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">
                  {meeting.title?.trim() || "Untitled Meeting"}
                </CardTitle>
              </CardHeader>

              <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="text-sm text-muted-foreground">
                  {formatMeetingDate(meeting.meeting_date)}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/meetings/${meeting.id}`)}
                  >
                    Open
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => router.push(`/meetings/${meeting.id}/print`)}
                  >
                    Print
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => router.push(`/meetings/${meeting.id}/raceday`)}
                  >
                    RaceDay
                  </Button>

                  <Button
                    variant="destructive"
                    disabled={deletingId === meeting.id}
                    onClick={() => handleDeleteMeeting(meeting.id)}
                  >
                    {deletingId === meeting.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}