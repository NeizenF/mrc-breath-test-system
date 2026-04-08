"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays } from "lucide-react";
import Image from "next/image";

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

        // Prefer the next upcoming (or today's) meeting; fall back to most recent past
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

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-100 to-slate-200 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-8 sm:px-6">

        {/* Top bar */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {loading ? (
              <Skeleton className="h-4 w-48" />
            ) : (
              <>Logged in as <span className="font-medium text-slate-700 dark:text-slate-300">{email}</span></>
            )}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? "Logging out..." : "Log out"}
          </Button>
        </div>

        {/* Main card */}
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-lg">
            <div className="overflow-hidden rounded-[2rem] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/60 dark:shadow-black/40">
              <div className="px-8 py-10 sm:px-10 sm:py-12">

                <div className="mb-8 text-center">
                  <div className="mx-auto mb-4 overflow-hidden rounded-2xl shadow-md">
                    <Image src="/mrc-logo.jpg" alt="MRC" width={56} height={56} className="h-14 w-14 object-cover" />
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
                    RaceDay
                  </h1>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    MRC Breath Test System
                  </p>
                </div>

                {/* Active meeting info */}
                <div className="mb-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3">
                  {loading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-5 w-48" />
                    </div>
                  ) : activeMeeting ? (
                    <div className="flex items-start gap-3">
                      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                            {getMeetingStatus(activeMeeting.meeting_date) === "today"
                              ? "Today's meeting"
                              : getMeetingStatus(activeMeeting.meeting_date) === "upcoming"
                              ? "Next meeting"
                              : "Most recent meeting"}
                          </p>
                          {getMeetingStatus(activeMeeting.meeting_date) === "today" && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-700 dark:bg-green-950 dark:text-green-400">
                              Today
                            </span>
                          )}
                          {getMeetingStatus(activeMeeting.meeting_date) === "upcoming" && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                              Upcoming
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
                          {activeMeeting.title || "Untitled meeting"}
                        </p>
                        {activeMeeting.meeting_date && (
                          <div className="flex items-baseline gap-2">
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {formatDate(activeMeeting.meeting_date)}
                            </p>
                            {getDaysLabel(activeMeeting.meeting_date) && getMeetingStatus(activeMeeting.meeting_date) !== "today" && (
                              <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                                · {getDaysLabel(activeMeeting.meeting_date)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      No active meeting found.
                    </p>
                  )}
                </div>

                <Button
                  className="w-full rounded-xl py-5 text-base font-semibold"
                  onClick={handleOpenRaceDay}
                  disabled={openingRaceDay || loading || !activeMeeting}
                >
                  {openingRaceDay ? "Opening..." : "Open RaceDay"}
                </Button>

              </div>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
