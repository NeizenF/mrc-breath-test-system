"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [openingRaceDay, setOpeningRaceDay] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (!session) {
          router.replace("/");
          return;
        }

        setEmail(session.user.email ?? null);
      } catch (error) {
        console.error("Failed to load session:", error);
        router.replace("/");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    checkSession();

    return () => {
      mounted = false;
    };
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
    try {
      setOpeningRaceDay(true);

      const { data, error } = await supabase
        .from("meetings")
        .select("id, meeting_date, created_at, is_archived")
        .eq("is_archived", false)
        .order("meeting_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data?.id) {
        alert("No active meetings found. Please create a meeting first.");
        return;
      }

      router.push(`/meetings/${data.id}/raceday`);
    } catch (error) {
      console.error("Failed to open RaceDay:", error);
      alert("Could not open RaceDay.");
    } finally {
      setOpeningRaceDay(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="text-sm text-slate-500">Loading dashboard...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-100 to-slate-200">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              MRC Breath Test System
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Logged in as {email || "user"}
            </p>
          </div>

          <Button
            variant="outline"
            className="rounded-xl"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? "Logging out..." : "Log Out"}
          </Button>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-3xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
            <div className="px-6 py-10 text-center sm:px-10 sm:py-14">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-2xl text-white shadow-md">
                🐎
              </div>

              <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
                RaceDay
              </h1>

              <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-500 sm:text-lg">
                Open the latest active meeting and go straight into race-day testing.
              </p>

              <div className="mt-8 flex justify-center">
                <Button
                  className="min-w-[220px] rounded-2xl px-8 py-6 text-base font-semibold"
                  onClick={handleOpenRaceDay}
                  disabled={openingRaceDay}
                >
                  {openingRaceDay ? "Opening RaceDay..." : "Open RaceDay"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}