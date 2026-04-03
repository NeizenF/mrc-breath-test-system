"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, ChevronRight } from "lucide-react";

type ActiveMeeting = {
  id: string;
  title: string | null;
  meeting_date: string | null;
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getMeetingStatus(dateStr: string | null): "today" | "upcoming" | "past" {
  if (!dateStr) return "past";
  const today = new Date().toISOString().split("T")[0];
  if (dateStr === today) return "today";
  if (dateStr > today) return "upcoming";
  return "past";
}

function getDaysLabel(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 0) return `In ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

export default function DashboardPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [openingRaceDay, setOpeningRaceDay] = useState(false);
  const [activeMeeting, setActiveMeeting] = useState<ActiveMeeting | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        if (!session) { router.replace("/"); return; }

        setEmail(session.user.email ?? null);

        const todayStr = new Date().toISOString().split("T")[0];

        const { data: upcoming } = await supabase
          .from("meetings")
          .select("id,title,meeting_date")
          .eq("is_archived", false)
          .gte("meeting_date", todayStr)
          .order("meeting_date", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!mounted) return;

        if (upcoming) {
          setActiveMeeting(upcoming);
        } else {
          const { data: recent } = await supabase
            .from("meetings")
            .select("id,title,meeting_date")
            .eq("is_archived", false)
            .order("meeting_date", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (mounted) setActiveMeeting(recent ?? null);
        }
      } catch (error) {
        console.error("Failed to load dashboard:", error);
        router.replace("/");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, [router]);

  async function handleLogout() {
    try {
      setLoggingOut(true);
      await supabase.auth.signOut();
      router.replace("/");
    } catch (error) {
      console.error("Logout failed:", error);
      setLoggingOut(false);
    }
  }

  async function handleOpenRaceDay() {
    if (!activeMeeting?.id) {
      toast.error("No active meetings found. Please create a meeting first.");
      return;
    }
    setOpeningRaceDay(true);
    router.push(`/meetings/${activeMeeting.id}/raceday`);
  }

  const status = getMeetingStatus(activeMeeting?.meeting_date ?? null);
  const daysLabel = getDaysLabel(activeMeeting?.meeting_date ?? null);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">

        {/* Hero */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 dark:bg-slate-700 text-3xl shadow-lg">
            🐎
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            RaceDay
          </h1>
          <p className="mt-1 text-slate-500 dark:text-slate-400 text-sm">
            Malta Racing Club · Breath Test System
          </p>
        </div>

        {/* Meeting card */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden mb-4">
          <div className="bg-slate-900 dark:bg-slate-950 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-300 text-sm font-medium">
              <CalendarDays className="h-4 w-4" />
              {status === "today" ? "Today's Meeting" : status === "upcoming" ? "Next Meeting" : "Most Recent Meeting"}
            </div>
            {status === "today" && (
              <span className="rounded-full bg-green-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                Today
              </span>
            )}
            {status === "upcoming" && daysLabel && (
              <span className="rounded-full bg-blue-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                {daysLabel}
              </span>
            )}
          </div>

          <div className="px-6 py-5">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
            ) : activeMeeting ? (
              <>
                <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {activeMeeting.title || "Untitled meeting"}
                </p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {formatDate(activeMeeting.meeting_date)}
                  {daysLabel && status !== "today" && (
                    <span className="ml-2 text-slate-400">· {daysLabel}</span>
                  )}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">No active meeting found.</p>
            )}
          </div>

          <div className="border-t border-slate-100 dark:border-slate-700 px-6 py-4">
            <Button
              className="w-full rounded-xl py-5 text-base font-semibold flex items-center justify-center gap-2"
              onClick={handleOpenRaceDay}
              disabled={openingRaceDay || loading || !activeMeeting}
            >
              {openingRaceDay ? "Opening..." : "Open RaceDay"}
              {!openingRaceDay && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>{email}</span>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            {loggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>

      </div>
    </main>
  );
}
