"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { PageHeader } from "@/components/pageHeader";
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

export default function ArchivePage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmUnarchiveId, setConfirmUnarchiveId] = useState<string | null>(null);

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

  async function doUnarchive(id: string) {
    setConfirmUnarchiveId(null);
    setRestoringId(id);

    const { error } = await supabase
      .from("meetings")
      .update({ is_archived: false })
      .eq("id", id);

    if (error) {
      console.error(error);
      toast.error("Failed to unarchive meeting.");
    } else {
      setMeetings((prev) => prev.filter((m) => m.id !== id));
    }

    setRestoringId(null);
  }

  if (checkingAccess) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-36" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <PageHeader
          title="Archive"
          subtitle="Archived race meetings."
          actions={
            <Button asChild variant="outline">
              <Link href="/admin/meetings">Back to Meetings</Link>
            </Button>
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
                    onClick={() => setConfirmUnarchiveId(meeting.id)}
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

      <ConfirmDialog
        open={confirmUnarchiveId !== null}
        title="Unarchive meeting?"
        description="This meeting will be removed from the archive and returned to Meetings."
        confirmLabel="Unarchive"
        onConfirm={() => confirmUnarchiveId && doUnarchive(confirmUnarchiveId)}
        onCancel={() => setConfirmUnarchiveId(null)}
      />
    </div>
  );
}