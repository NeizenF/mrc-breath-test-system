"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { PageHeader } from "@/components/pageHeader";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Skeleton } from "@/components/ui/skeleton";

type Meeting = {
  id: string;
  title: string | null;
  meeting_date: string | null;
  created_at?: string | null;
  is_archived?: boolean;
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
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function loadMeetings() {
    setLoading(true);

    const { data, error } = await supabase
      .from("meetings")
      .select("id,title,meeting_date,created_at,is_archived")
      .eq("is_archived", false)
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

    async function checkAccess() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (!session) {
          router.replace("/");
          return;
        }

        const admin = await isCurrentUserAdmin();

        if (!mounted) return;

        if (!admin) {
          router.replace("/dashboard");
          return;
        }

        setCheckingAccess(false);
        await loadMeetings();
      } catch (error) {
        console.error("Failed to check admin access:", error);
        router.replace("/dashboard");
      }
    }

    checkAccess();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function doArchiveMeeting(meetingId: string) {
    setConfirmArchiveId(null);
    setArchivingId(meetingId);

    try {
      const { error } = await supabase
        .from("meetings")
        .update({ is_archived: true })
        .eq("id", meetingId);

      if (error) throw error;

      setMeetings((prev) => prev.filter((m) => m.id !== meetingId));
    } catch (error) {
      console.error("Archive meeting failed:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to archive meeting. Check console for details."
      );
    } finally {
      setArchivingId(null);
    }
  }

  async function doDeleteMeeting(meetingId: string) {
    setConfirmDeleteId(null);
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
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to delete meeting. Check console for details."
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (checkingAccess) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-2">
        <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Meetings" }]} />
      </div>
      <div className="mb-6 mt-4">
        <PageHeader
          title="Meetings"
          subtitle="Manage your active race meetings."
          actions={
            <>
              <Button variant="outline" onClick={() => router.push("/admin/archive")}>
                Archive
              </Button>
              <Button onClick={() => router.push("/meetings/new")}>
                New Meeting
              </Button>
            </>
          }
        />
      </div>

      {loading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : meetings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No active meetings found.
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
                    onClick={() => router.push(`/meetings/${meeting.id}/edit`)}
                  >
                    Edit
                  </Button>

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
                    variant="outline"
                    disabled={archivingId === meeting.id}
                    onClick={() => setConfirmArchiveId(meeting.id)}
                  >
                    {archivingId === meeting.id ? "Archiving..." : "Archive"}
                  </Button>

                  <Button
                    variant="destructive"
                    disabled={deletingId === meeting.id}
                    onClick={() => setConfirmDeleteId(meeting.id)}
                  >
                    {deletingId === meeting.id ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmArchiveId !== null}
        title="Archive meeting?"
        description="This meeting will be removed from Meetings and shown in Archive."
        confirmLabel="Archive"
        onConfirm={() => confirmArchiveId && doArchiveMeeting(confirmArchiveId)}
        onCancel={() => setConfirmArchiveId(null)}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete meeting?"
        description="This will permanently delete the meeting along with all its races, entries, and tests."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => confirmDeleteId && doDeleteMeeting(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}