"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import {
  CalendarDays, Flag, CheckCircle, AlertCircle,
  Play, FileInput, Pencil, ScrollText, FileText, LayoutList,
  Archive, Trash2,
} from "lucide-react";

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

  const statItems = stats ? [
    { icon: CalendarDays, label: "Races", value: stats.races, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950" },
    { icon: Flag, label: "Runners", value: stats.entries, color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-950" },
    { icon: CheckCircle, label: "Tested", value: stats.tested, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950" },
    { icon: AlertCircle, label: "Positives", value: stats.positives, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-950" },
  ] : [];

  const actions = [
    { icon: Play, label: "RaceDay", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950", onClick: () => router.push(`/meetings/${meetingId}/raceday`) },
    { icon: FileInput, label: "Import / Races", color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-950", onClick: () => router.push(`/meetings/${meetingId}`) },
    { icon: Pencil, label: "Edit Details", color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950", onClick: () => router.push(`/meetings/${meetingId}/edit`) },
    { icon: LayoutList, label: "Summary", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950", onClick: () => router.push(`/meetings/${meetingId}/summary`) },
    { icon: ScrollText, label: "Print Checklist", color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-950", onClick: () => router.push(`/meetings/${meetingId}/print`) },
    { icon: FileText, label: "Declaration", color: "text-pink-600 dark:text-pink-400", bg: "bg-pink-50 dark:bg-pink-950", onClick: () => router.push(`/meetings/${meetingId}/declaration`) },
  ];

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
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950">
              <CalendarDays className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
                {meeting.is_archived && (
                  <span className="rounded-full bg-amber-100 dark:bg-amber-950 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">Archived</span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{formatDate(meeting.meeting_date)}</p>
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {statItems.map(({ icon: Icon, label, value, color, bg }) => (
                <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
                  <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-xl ${bg}`}>
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Actions</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {actions.map(({ icon: Icon, label, color, bg, onClick }) => (
                <button
                  key={label}
                  onClick={onClick}
                  className="group flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3.5 text-left shadow-sm transition hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md active:scale-[0.99]"
                >
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${bg}`}>
                    <Icon className={`h-4 w-4 ${color}`} />
                  </div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Danger zone */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-rose-500">Danger Zone</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={archiving} onClick={() => setConfirmArchive(true)} className="gap-2">
                <Archive className="h-4 w-4" />
                {archiving ? "Archiving..." : "Archive Meeting"}
              </Button>
              <Button variant="destructive" disabled={deleting} onClick={() => setConfirmDelete(true)} className="gap-2">
                <Trash2 className="h-4 w-4" />
                {deleting ? "Deleting..." : "Delete Meeting"}
              </Button>
            </div>
          </div>

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
