"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

export default function ArchivePage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function loadArchive() {
    setLoading(true);

    const { data, error } = await supabase
      .from("meetings")
      .select("id,title,meeting_date,created_at,is_archived")
      .eq("is_archived", true)
      .order("meeting_date", { ascending: false, nullsFirst: false });

    if (error) {
      console.error(error);
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
        await loadArchive();
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

  async function handleUnarchive(id: string) {
    const confirmed = window.confirm(
      "Unarchive this meeting?\n\nIt will return to Meetings."
    );

    if (!confirmed) return;

    setRestoringId(id);

    const { error } = await supabase
      .from("meetings")
      .update({ is_archived: false })
      .eq("id", id);

    if (error) {
      console.error(error);
      alert("Failed to unarchive meeting.");
    } else {
      setMeetings((prev) => prev.filter((m) => m.id !== id));
    }

    setRestoringId(null);
  }

  if (checkingAccess) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-sm text-muted-foreground">
          Checking admin access...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Archive</h1>
          <p className="text-sm text-muted-foreground">
            Archived race meetings
          </p>
        </div>

        <Button asChild variant="outline">
          <Link href="/admin/meetings">Back to Meetings</Link>
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading archive...</div>
      ) : meetings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No archived meetings found.
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
                  <Button asChild variant="outline">
                    <Link href={`/admin/archive/${meeting.id}`}>View</Link>
                  </Button>

                  <Button
                    variant="outline"
                    disabled={restoringId === meeting.id}
                    onClick={() => handleUnarchive(meeting.id)}
                  >
                    {restoringId === meeting.id ? "Restoring..." : "Unarchive"}
                  </Button>

                  <Button variant="outline" asChild>
                    <Link href={`/meetings/${meeting.id}/print`}>Print</Link>
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