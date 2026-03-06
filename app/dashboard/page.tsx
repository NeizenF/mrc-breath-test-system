"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        .select("id, meeting_date, created_at")
        .order("meeting_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data?.id) {
        alert("No meetings found. Please create a meeting first.");
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
      <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
        <div className="text-sm text-slate-500">Loading dashboard...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                MRC Breath Test System
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                MRC System
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Logged in as {email || "user"}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={handleOpenRaceDay}
                disabled={openingRaceDay}
              >
                {openingRaceDay ? "Opening RaceDay..." : "Open RaceDay"}
              </Button>

              <Button
                variant="outline"
                className="rounded-xl"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? "Logging out..." : "Log Out"}
              </Button>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Main Areas</h2>
          <p className="mt-1 text-sm text-slate-500">
            Open the area you want to work in.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">Meetings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-5 text-sm leading-6 text-slate-500">
                Create meetings, import races, manage entries, and prepare each race day.
              </p>
              <Button
                className="w-full rounded-xl"
                onClick={() => router.push("/meetings")}
              >
                Open Meetings
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">DriverInfo</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-5 text-sm leading-6 text-slate-500">
                Manage the driver database, including ID card details, phone numbers, and imports.
              </p>
              <Button
                className="w-full rounded-xl"
                onClick={() => router.push("/drivers")}
              >
                Open DriverInfo
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">RaceDay</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-5 text-sm leading-6 text-slate-500">
                Open the latest meeting’s RaceDay page for fast breathalyzer testing access.
              </p>
              <Button
                className="w-full rounded-xl"
                onClick={handleOpenRaceDay}
                disabled={openingRaceDay}
              >
                {openingRaceDay ? "Opening RaceDay..." : "Open RaceDay"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}