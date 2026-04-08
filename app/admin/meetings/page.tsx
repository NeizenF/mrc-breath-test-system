"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ChevronRight } from "lucide-react";

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
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function isToday(dateStr: string | null) {
  if (!dateStr) return false;
  const today = new Date().toISOString().slice(0, 10);
  return dateStr.slice(0, 10) === today;
}

function isUpcoming(dateStr: string | null) {
  if (!dateStr) return false;
  return dateStr.slice(0, 10) > new Date().toISOString().slice(0, 10);
}

export default function MeetingsPage() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        if (!session) { router.replace("/"); return; }
        const admin = await isCurrentUserAdmin();
        if (!mounted) return;
        if (!admin) { router.replace("/dashboard"); return; }
        setCheckingAccess(false);

        const { data } = await supabase
          .from("meetings")
          .select("id,title,meeting_date,created_at")
          .eq("is_archived", false)
          .order("meeting_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false, nullsFirst: false });

        if (mounted) { setMeetings(data || []); setLoading(false); }
      } catch { router.replace("/dashboard"); }
    }
    init();
    return () => { mounted = false; };
  }, [router]);

  if (checkingAccess) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-7 w-36" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-2">
        <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Meetings" }]} />
      </div>
      <div className="mb-6 mt-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Meetings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Active race meetings.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/admin/archive")}>Archive</Button>
          <Button onClick={() => router.push("/meetings/new")}>New Meeting</Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : meetings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No active meetings found.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {meetings.map((meeting) => {
                const today = isToday(meeting.meeting_date);
                const upcoming = isUpcoming(meeting.meeting_date);
                return (
                  <button
                    key={meeting.id}
                    onClick={() => router.push(`/admin/meetings/${meeting.id}`)}
                    className="group flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{meeting.title?.trim() || "Untitled Meeting"}</span>
                        {today && (
                          <span className="rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 px-2 py-0.5 text-xs font-medium">Today</span>
                        )}
                        {!today && upcoming && (
                          <span className="rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 text-xs font-medium">Upcoming</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatMeetingDate(meeting.meeting_date)}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" />
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
