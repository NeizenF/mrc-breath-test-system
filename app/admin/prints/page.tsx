"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Button } from "@/components/ui/button";
import { FileText, ScrollText, Printer, LayoutList } from "lucide-react";

type Meeting = {
  id: string;
  title: string | null;
  meeting_date: string | null;
  is_archived: boolean;
};

function formatMeetingLabel(m: Meeting) {
  const title = m.title?.trim();
  if (title) return title;
  if (m.meeting_date) {
    return new Date(m.meeting_date).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  }
  return "Unnamed Meeting";
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

export default function AdminPrintsPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(true);

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

        const { data, error } = await supabase
          .from("meetings")
          .select("id,title,meeting_date,is_archived")
          .order("meeting_date", { ascending: false });

        if (!error && mounted) {
          setMeetings((data as Meeting[]) || []);
        }

        setLoading(false);
      } catch {
        router.replace("/dashboard");
      }
    }

    load();
    return () => { mounted = false; };
  }, [router]);

  const filtered = meetings.filter((m) => {
    if (!showArchived && m.is_archived) return false;
    if (search.trim()) {
      const label = formatMeetingLabel(m).toLowerCase();
      const date = formatDate(m.meeting_date)?.toLowerCase() ?? "";
      const q = search.toLowerCase();
      if (!label.includes(q) && !date.includes(q)) return false;
    }
    return true;
  });

  const active = filtered.filter((m) => !m.is_archived);
  const archived = filtered.filter((m) => m.is_archived);

  if (checkingAccess) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-7 w-36" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  function MeetingRow({ m }: { m: Meeting }) {
    const label = formatMeetingLabel(m);
    const date = formatDate(m.meeting_date);
    return (
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{label}</span>
            {m.is_archived && (
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                Archived
              </span>
            )}
          </div>
          {date && <p className="mt-0.5 text-xs text-muted-foreground">{date}</p>}
        </div>
        <div className="flex shrink-0 gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => window.open(`/meetings/${m.id}/racecard`, "_blank")}
          >
            <LayoutList className="h-3.5 w-3.5" />
            Race Cards
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => window.open(`/meetings/${m.id}/print`, "_blank")}
          >
            <ScrollText className="h-3.5 w-3.5" />
            Checklist
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => window.open(`/meetings/${m.id}/declaration`, "_blank")}
          >
            <FileText className="h-3.5 w-3.5" />
            Declaration
          </Button>
          <Button
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => {
              window.open(`/meetings/${m.id}/print`, "_blank");
              window.open(`/meetings/${m.id}/declaration`, "_blank");
            }}
          >
            <Printer className="h-3.5 w-3.5" />
            Both
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-2">
        <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Prints" }]} />
      </div>
      <div className="mb-6 mt-4">
        <h1 className="text-xl font-semibold tracking-tight">Prints</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Print the checklist or declaration letter for any meeting.
        </p>
      </div>

      {/* Search + toggle */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search meetings..."
          className="h-8 w-full max-w-[240px] rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <button
          onClick={() => setShowArchived((v) => !v)}
          className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
            showArchived
              ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100"
              : "border-slate-200 dark:border-slate-700 text-muted-foreground hover:bg-muted"
          }`}
        >
          {showArchived ? "Archived: on" : "Archived: off"}
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No meetings found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Active</p>
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {active.map((m) => <MeetingRow key={m.id} m={m} />)}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          {archived.length > 0 && showArchived && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Archived</p>
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {archived.map((m) => <MeetingRow key={m.id} m={m} />)}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
