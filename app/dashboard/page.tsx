"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays } from "lucide-react";

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

        const { data } = await supabase
          .from("meetings")
          .select("id,title,meeting_date")
          .eq("is_archived", false)
          .order("meeting_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (mounted) setActiveMeeting(data ?? null);
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
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 dark:bg-slate-700 text-2xl shadow-md">
                    🐎
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
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          Active meeting
                        </p>
                        <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
                          {activeMeeting.title || "Untitled meeting"}
                        </p>
                        {activeMeeting.meeting_date && (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {formatDate(activeMeeting.meeting_date)}
                          </p>
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
