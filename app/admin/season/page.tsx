"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";

type MeetingStat = { id: string; label: string; totalTested: number; positives: number };
type Summary = { totalMeetings: number; totalTested: number; totalPositives: number };
type RaceStat = { race: string; Tested: number; Positives: number };
type DriverStat = { driver: string; Tests: number };

function pluck<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

export default function SeasonDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary>({ totalMeetings: 0, totalTested: 0, totalPositives: 0 });
  const [meetingStats, setMeetingStats] = useState<MeetingStat[]>([]);
  const [raceStats, setRaceStats] = useState<RaceStat[]>([]);
  const [driverStats, setDriverStats] = useState<DriverStat[]>([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session) { router.replace("/"); return; }

      const admin = await isCurrentUserAdmin();
      if (!mounted) return;
      if (!admin) { router.replace("/dashboard"); return; }

      // Fetch all data in parallel
      const [
        { data: meetings },
        { data: tests },
        { data: raceTests },
        { data: driverTests },
      ] = await Promise.all([
        supabase
          .from("meetings")
          .select("id,title,meeting_date")
          .eq("is_archived", false)
          .order("meeting_date", { ascending: true }),

        supabase
          .from("tests")
          .select("meeting_id,result")
          .eq("tested", true),

        supabase
          .from("tests")
          .select("result,entries(races(race_number))")
          .eq("tested", true),

        supabase
          .from("tests")
          .select("entries(driver_name_raw,drivers(full_name))")
          .eq("tested", true),
      ]);

      if (!mounted) return;

      // ── Per-meeting stats ──────────────────────────────────────────────────
      const meetingList = meetings ?? [];
      const testList = tests ?? [];

      const statsMap = new Map<string, { totalTested: number; positives: number }>();
      for (const t of testList) {
        if (!t.meeting_id) continue;
        const s = statsMap.get(t.meeting_id) ?? { totalTested: 0, positives: 0 };
        s.totalTested += 1;
        if (t.result === "positive") s.positives += 1;
        statsMap.set(t.meeting_id, s);
      }

      const mStats: MeetingStat[] = meetingList.map((m) => {
        const s = statsMap.get(m.id) ?? { totalTested: 0, positives: 0 };
        const d = m.meeting_date
          ? new Date(m.meeting_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          : "—";
        return { id: m.id, label: m.title?.trim() || d, ...s };
      }).filter((s) => s.totalTested > 0);

      // ── By race number ─────────────────────────────────────────────────────
      const raceMap = new Map<number, { tested: number; positives: number }>();
      for (const t of (raceTests ?? [])) {
        const entry = pluck((t as { entries: unknown }).entries as Parameters<typeof pluck>[0]);
        const race = pluck((entry as { races?: unknown } | null)?.races as Parameters<typeof pluck>[0]);
        const rn: number | null = (race as { race_number?: number } | null)?.race_number ?? null;
        if (!rn) continue;
        const s = raceMap.get(rn) ?? { tested: 0, positives: 0 };
        s.tested += 1;
        if ((t as { result?: string }).result === "positive") s.positives += 1;
        raceMap.set(rn, s);
      }
      const rStats: RaceStat[] = Array.from(raceMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([rn, s]) => ({ race: `R${rn}`, Tested: s.tested, Positives: s.positives }));

      // ── By driver ─────────────────────────────────────────────────────────
      const driverMap = new Map<string, number>();
      for (const t of (driverTests ?? [])) {
        const entry = pluck((t as { entries: unknown }).entries as Parameters<typeof pluck>[0]);
        if (!entry) continue;
        const e = entry as { driver_name_raw?: string | null; drivers?: unknown };
        const dr = pluck(e.drivers as Parameters<typeof pluck>[0]);
        const name = (dr as { full_name?: string } | null)?.full_name?.trim()
          || e.driver_name_raw?.trim()
          || null;
        if (!name) continue;
        driverMap.set(name, (driverMap.get(name) ?? 0) + 1);
      }
      const dStats: DriverStat[] = Array.from(driverMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([driver, Tests]) => ({ driver, Tests }));

      setSummary({
        totalMeetings: meetingList.length,
        totalTested: testList.length,
        totalPositives: testList.filter((t) => t.result === "positive").length,
      });
      setMeetingStats(mStats);
      setRaceStats(rStats);
      setDriverStats(dStats);
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, [router]);

  const positiveRate = summary.totalTested > 0
    ? ((summary.totalPositives / summary.totalTested) * 100).toFixed(1)
    : "0.0";

  const meetingChartData = meetingStats.map((s) => ({
    name: s.label,
    Tested: s.totalTested,
    Positives: s.positives,
  }));

  const rateData = meetingStats.map((s) => ({
    name: s.label,
    "Positive %": s.totalTested > 0 ? parseFloat(((s.positives / s.totalTested) * 100).toFixed(1)) : 0,
  }));

  const summaryCards = [
    { label: "Active Meetings", value: summary.totalMeetings.toString(), color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Tests Conducted", value: summary.totalTested.toString(), color: "text-sky-600 dark:text-sky-400" },
    { label: "Positives", value: summary.totalPositives.toString(), color: "text-red-600 dark:text-red-400" },
    { label: "Positive Rate", value: `${positiveRate}%`, color: "text-amber-600 dark:text-amber-400" },
  ];

  const hasData = meetingStats.length > 0;

  return (
    <div className="p-4 md:p-6">
      <div className="mb-2">
        <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Season Dashboard" }]} />
      </div>
      <div className="mb-6 mt-4">
        <h1 className="text-xl font-semibold tracking-tight">Season Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Season-wide breath test statistics.</p>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="py-5 px-5">
              {loading ? (
                <Skeleton className="h-8 w-16 mb-1" />
              ) : (
                <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
        </div>
      ) : !hasData ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No test data yet. Run some race days first.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">

          {/* Row 1: Tests per meeting + Positive rate trend */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="pt-5 pb-4 px-4">
                <p className="mb-4 text-sm font-medium">Tests per Meeting</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={meetingChartData} margin={{ top: 0, right: 8, left: -20, bottom: 44 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Tested" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Positives" fill="#f87171" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4 px-4">
                <p className="mb-4 text-sm font-medium">Positive Rate Trend (%)</p>
                {rateData.length < 2 ? (
                  <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                    Need at least 2 meetings with data.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={rateData} margin={{ top: 0, right: 8, left: -20, bottom: 44 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, "auto"]} />
                      <Tooltip formatter={(v) => [`${v}%`, "Positive Rate"]} />
                      <Line type="monotone" dataKey="Positive %" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4, fill: "#f59e0b" }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Tests by race number + Top drivers */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="pt-5 pb-4 px-4">
                <p className="mb-4 text-sm font-medium">Tests by Race Number</p>
                {raceStats.length === 0 ? (
                  <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">No data.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={raceStats} margin={{ top: 0, right: 8, left: -20, bottom: 8 }}>
                      <XAxis dataKey="race" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Tested" fill="#818cf8" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Positives" fill="#f87171" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 pb-4 px-4">
                <p className="mb-4 text-sm font-medium">Most Tested Drivers (Top 12)</p>
                {driverStats.length === 0 ? (
                  <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">No data.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      data={driverStats}
                      layout="vertical"
                      margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
                    >
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="driver"
                        tick={{ fontSize: 10 }}
                        width={90}
                      />
                      <Tooltip />
                      <Bar dataKey="Tests" fill="#34d399" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

        </div>
      )}
    </div>
  );
}
