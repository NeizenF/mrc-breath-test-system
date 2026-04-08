"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

type Meeting = {
  id: string;
  title: string | null;
  meeting_date: string | null;
  is_archived: boolean;
};

type Stats = {
  races: number;
  entries: number;
  tested: number;
  positives: number;
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "No date";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function MeetingProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const meetingId = params.id;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        if (!session) { router.replace("/"); return; }
        const admin = await isCurrentUserAdmin();
        if (!mounted) return;
        if (!admin) { router.replace("/dashboard"); return; }
        setCheckingAccess(false);

        const [
          { data: m },
          { data: races },
          { data: tests },
        ] = await Promise.all([
          supabase.from("meetings").select("id,title,meeting_date,is_archived").eq("id", meetingId).single(),
          supabase.from("races").select("id").eq("meeting_id", meetingId),
          supabase.from("tests").select("result").eq("meeting_id", meetingId),
        ]);

        if (!mounted) return;

        if (!m) { router.replace("/admin/meetings"); return; }
        setMeeting(m as Meeting);

        const raceIds = (races || []).map((r) => r.id);
        let entryCount = 0;
        if (raceIds.length > 0) {
          const { count } = await supabase
            .from("entries")
            .select("id", { count: "exact", head: true })
            .in("race_id", raceIds)
            .eq("scratched", false);
          entryCount = count ?? 0;
        }

        const testRows = tests || [];
        setStats({
          races: races?.length ?? 0,
          entries: entryCount,
          tested: testRows.filter((t) => t.result !== null).length,
          positives: testRows.filter((t) => t.result === "positive").length,
        });

        setLoading(false);
      } catch { router.replace("/admin/meetings"); }
    }
    load();
    return () => { mounted = false; };
  }, [meetingId, router]);

  async function doArchive() {
    setConfirmArchive(false);
    setArchiving(true);
    const { error } = await supabase.from("meetings").update({ is_archived: true }).eq("id", meetingId);
    if (error) { toast.error(error.message); setArchiving(false); return; }
    toast.success("Meeting archived.");
    router.replace("/admin/meetings");
  }

  async function doDelete() {
    setConfirmDelete(false);
    setDeleting(true);
    try {
      const { data: races } = await supabase.from("races").select("id").eq("meeting_id", meetingId);
      const raceIds = (races || []).map((r) => r.id);

      await supabase.from("tests").delete().eq("meeting_id", meetingId);
      if (raceIds.length > 0) {
        await supabase.from("entries").delete().in("race_id", raceIds);
        await supabase.from("races").delete().eq("meeting_id", meetingId);
      }

      const { data: deleted, error } = await supabase.from("meetings").delete().eq("id", meetingId).select("id");
      if (error) throw error;
      if (!deleted?.length) throw new Error("Meeting could not be deleted. Check RLS policies.");

      toast.success("Meeting deleted.");
      router.replace("/admin/meetings");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
      setDeleting(false);
    }
  }

  if (checkingAccess) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const title = meeting?.title?.trim() || "Untitled Meeting";

  return (
    <div className="p-4 md:p-6 max-w-2xl">
      <div className="mb-2">
        <Breadcrumbs items={[
          { label: "Admin", href: "/admin" },
          { label: "Meetings", href: "/admin/meetings" },
          { label: loading ? "..." : title },
        ]} />
      </div>

      {loading ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      ) : !meeting ? null : (
        <div className="mt-6 space-y-6">

          {/* Header */}
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{formatDate(meeting.meeting_date)}</p>
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Races</div>
                <div className="mt-1 text-2xl font-semibold">{stats.races}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Runners</div>
                <div className="mt-1 text-2xl font-semibold">{stats.entries}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">Tested</div>
                <div className="mt-1 text-2xl font-semibold">{stats.tested}</div>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 p-3">
                <div className="text-xs text-red-600 dark:text-red-400">Positives</div>
                <div className="mt-1 text-2xl font-semibold text-red-700 dark:text-red-300">{stats.positives}</div>
              </div>
            </div>
          )}

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Button variant="outline" onClick={() => router.push(`/meetings/${meetingId}/raceday`)}>
                RaceDay
              </Button>
              <Button variant="outline" onClick={() => router.push(`/meetings/${meetingId}`)}>
                Import / Races
              </Button>
              <Button variant="outline" onClick={() => router.push(`/meetings/${meetingId}/edit`)}>
                Edit Details
              </Button>
              <Button variant="outline" onClick={() => router.push(`/admin/declarations/${meetingId}`)}>
                Declared Runners
              </Button>
              <Button variant="outline" onClick={() => router.push(`/meetings/${meetingId}/print`)}>
                Print Results
              </Button>
              <Button variant="outline" onClick={() => router.push(`/meetings/${meetingId}/summary`)}>
                Summary
              </Button>
            </CardContent>
          </Card>

          {/* Danger zone */}
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={archiving}
                onClick={() => setConfirmArchive(true)}
              >
                {archiving ? "Archiving..." : "Archive Meeting"}
              </Button>
              <Button
                variant="destructive"
                disabled={deleting}
                onClick={() => setConfirmDelete(true)}
              >
                {deleting ? "Deleting..." : "Delete Meeting"}
              </Button>
            </CardContent>
          </Card>

        </div>
      )}

      <ConfirmDialog
        open={confirmArchive}
        title="Archive meeting?"
        description="This meeting will be moved to the archive. You can restore it later."
        confirmLabel="Archive"
        onConfirm={doArchive}
        onCancel={() => setConfirmArchive(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete meeting?"
        description="This will permanently delete the meeting along with all its races, entries, and tests."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
