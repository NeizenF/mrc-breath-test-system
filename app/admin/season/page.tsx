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
  AreaChart, Area,
} from "recharts";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

type MeetingStat  = { id: string; label: string; date: string; totalTested: number; positives: number };
type RaceStat     = { race: string; Tested: number; Positives: number };
type DriverStat   = { driver: string; Tests: number; Positives: number };
type MonthStat    = { month: string; Tested: number; Positives: number };
type CumStat      = { name: string; Total: number };

type AllData = {
  totalMeetings: number;
  totalTested: number;
  totalPositives: number;
  uniqueDrivers: number;
  meetingStats: MeetingStat[];
  raceStats: RaceStat[];
  driverStats: DriverStat[];
  monthStats: MonthStat[];
  cumulativeStats: CumStat[];
};

const TABS = ["Overview", "Races", "Drivers", "Trends"] as const;
type Tab = typeof TABS[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

function pluck<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

function ChartCard({ title, height = 260, children }: { title: string; height?: number; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 px-4">
        <p className="mb-4 text-sm font-medium">{title}</p>
        <ResponsiveContainer width="100%" height={height}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function Empty({ message = "Not enough data yet." }: { message?: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SeasonDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AllData | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session) { router.replace("/"); return; }

      const admin = await isCurrentUserAdmin();
      if (!mounted) return;
      if (!admin) { router.replace("/dashboard"); return; }

      const [{ data: meetings }, { data: rawTests }] = await Promise.all([
        supabase
          .from("meetings")
          .select("id,title,meeting_date")
          .order("meeting_date", { ascending: true }),

        supabase
          .from("tests")
          .select("meeting_id,entry_id,result,entries(driver_name_raw,drivers(full_name),races(race_number))")
          .eq("tested", true)
          .limit(10000),
      ]);

      if (!mounted) return;

      const meetingList = meetings ?? [];
      const tests = rawTests ?? [];

      // ── Per-meeting — deduplicate by driver+meeting so one tested driver
      //    with entries in 8 races counts as 1 test, not 8 ────────────────
      const statsMap = new Map<string, { totalTested: number; positives: number; drivers: Set<string> }>();
      for (const t of tests) {
        if (!t.meeting_id) continue;
        const entry = pluck((t as { entries: unknown }).entries as Parameters<typeof pluck>[0]);
        const e = entry as { driver_name_raw?: string | null; drivers?: unknown } | null;
        const dr = pluck(e?.drivers as Parameters<typeof pluck>[0]);
        const driverKey = (dr as { full_name?: string } | null)?.full_name?.trim()
          || e?.driver_name_raw?.trim()
          || (t as { entry_id?: string }).entry_id
          || "unknown";

        const s = statsMap.get(t.meeting_id) ?? { totalTested: 0, positives: 0, drivers: new Set() };
        if (!s.drivers.has(driverKey)) {
          s.drivers.add(driverKey);
          s.totalTested += 1;
          if (t.result === "positive") s.positives += 1;
        }
        statsMap.set(t.meeting_id, s);
      }

      const meetingStats: MeetingStat[] = meetingList.map((m) => {
        const s = statsMap.get(m.id) ?? { totalTested: 0, positives: 0 };
        const d = m.meeting_date
          ? new Date(m.meeting_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          : "—";
        return { id: m.id, label: m.title?.trim() || d, date: m.meeting_date ?? "", ...s };
      }).filter((s) => s.totalTested > 0);

      // ── By race number ───────────────────────────────────────────────────
      const raceMap = new Map<number, { tested: number; positives: number }>();
      for (const t of tests) {
        const entry = pluck((t as { entries: unknown }).entries as Parameters<typeof pluck>[0]);
        const race  = pluck((entry as { races?: unknown } | null)?.races as Parameters<typeof pluck>[0]);
        const rn: number | null = (race as { race_number?: number } | null)?.race_number ?? null;
        if (!rn) continue;
        const s = raceMap.get(rn) ?? { tested: 0, positives: 0 };
        s.tested += 1;
        if ((t as { result?: string }).result === "positive") s.positives += 1;
        raceMap.set(rn, s);
      }
      const raceStats: RaceStat[] = Array.from(raceMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([rn, s]) => ({ race: `R${rn}`, Tested: s.tested, Positives: s.positives }));

      // ── By driver (one test per meeting, deduplicated) ───────────────────
      // Drivers are tested once per meeting regardless of how many races they drive.
      // Count distinct meetings per driver, and distinct meetings where they tested positive.
      const driverMeetings    = new Map<string, Set<string>>();
      const driverPosMeetings = new Map<string, Set<string>>();

      for (const t of tests) {
        const entry = pluck((t as { entries: unknown }).entries as Parameters<typeof pluck>[0]);
        if (!entry) continue;
        const e   = entry as { driver_name_raw?: string | null; drivers?: unknown };
        const dr  = pluck(e.drivers as Parameters<typeof pluck>[0]);
        const name = (dr as { full_name?: string } | null)?.full_name?.trim()
          || e.driver_name_raw?.trim()
          || null;
        if (!name) continue;
        const mid = (t as { meeting_id?: string | null }).meeting_id;
        if (!mid) continue;

        if (!driverMeetings.has(name)) driverMeetings.set(name, new Set());
        driverMeetings.get(name)!.add(mid);

        if ((t as { result?: string }).result === "positive") {
          if (!driverPosMeetings.has(name)) driverPosMeetings.set(name, new Set());
          driverPosMeetings.get(name)!.add(mid);
        }
      }

      const driverStats: DriverStat[] = Array.from(driverMeetings.entries())
        .map(([driver, meetings]) => ({
          driver,
          Tests:     meetings.size,
          Positives: driverPosMeetings.get(driver)?.size ?? 0,
        }))
        .sort((a, b) => b.Tests - a.Tests)
        .slice(0, 15);

      const uniqueDrivers = driverMeetings.size;

      // ── Monthly ──────────────────────────────────────────────────────────
      const monthMap = new Map<string, { tested: number; positives: number; ts: number }>();
      for (const m of meetingList) {
        const s = statsMap.get(m.id);
        if (!s || s.totalTested === 0 || !m.meeting_date) continue;
        const d   = new Date(m.meeting_date);
        const key = d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
        const ex  = monthMap.get(key) ?? { tested: 0, positives: 0, ts: d.getTime() };
        ex.tested    += s.totalTested;
        ex.positives += s.positives;
        monthMap.set(key, ex);
      }
      const monthStats: MonthStat[] = Array.from(monthMap.entries())
        .sort((a, b) => a[1].ts - b[1].ts)
        .map(([month, s]) => ({ month, Tested: s.tested, Positives: s.positives }));

      // ── Cumulative ───────────────────────────────────────────────────────
      let cum = 0;
      const cumulativeStats: CumStat[] = meetingStats.map((m) => {
        cum += m.totalTested;
        return { name: m.label, Total: cum };
      });

      const meetingsWithTests = meetingStats.filter((s) => s.totalTested > 0).length;

      const totalTested = Array.from(statsMap.values()).reduce((sum, s) => sum + s.totalTested, 0);
      const totalPositives = Array.from(statsMap.values()).reduce((sum, s) => sum + s.positives, 0);

      setData({
        totalMeetings: meetingsWithTests,
        totalTested,
        totalPositives,
        uniqueDrivers,
        meetingStats,
        raceStats,
        driverStats,
        monthStats,
        cumulativeStats,
      });
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, [router, refreshKey]);

  // ── Derived chart series ───────────────────────────────────────────────────

  const meetingChartData = data?.meetingStats.map((s) => ({
    name: s.label,
    Tested: s.totalTested,
    Positives: s.positives,
  })) ?? [];

  const rateData = data?.meetingStats.map((s) => ({
    name: s.label,
    "Positive %": s.totalTested > 0 ? parseFloat(((s.positives / s.totalTested) * 100).toFixed(1)) : 0,
  })) ?? [];

  const positiveRate = data && data.totalTested > 0
    ? ((data.totalPositives / data.totalTested) * 100).toFixed(1)
    : "0.0";

  const summaryCards = data ? [
    { label: "Active Meetings",   value: data.totalMeetings.toString(),   color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Tests Conducted",   value: data.totalTested.toString(),      color: "text-sky-600 dark:text-sky-400" },
    { label: "Unique Drivers",    value: data.uniqueDrivers.toString(),    color: "text-violet-600 dark:text-violet-400" },
    { label: "Positives",         value: data.totalPositives.toString(),   color: "text-red-600 dark:text-red-400" },
    { label: "Positive Rate",     value: `${positiveRate}%`,              color: "text-amber-600 dark:text-amber-400" },
  ] : [];

  const sharedXAxis = (
    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
  );
  const sharedYAxis = <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6">
      <div className="mb-2">
        <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Season Dashboard" }]} />
      </div>
      <div className="mb-5 mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Season Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Season-wide breath test analytics.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setLoading(true); setRefreshKey(k => k + 1); }}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="mb-6 flex flex-wrap gap-3">
        {loading
          ? [1, 2, 3, 4, 5].map((i) => (
              <Card key={i} className="flex-1 min-w-[140px]">
                <CardContent className="py-4 px-4">
                  <Skeleton className="h-8 w-16 mb-1" />
                  <Skeleton className="h-3 w-24 mt-2" />
                </CardContent>
              </Card>
            ))
          : summaryCards.map(({ label, value, color }) => (
              <Card key={label} className="flex-1 min-w-[140px]">
                <CardContent className="py-4 px-4">
                  <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{label}</p>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-0 border-b border-slate-200 dark:border-slate-700">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab
                ? "border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
                : "border-transparent text-muted-foreground hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-72 w-full rounded-xl" />)}
        </div>
      ) : !data || data.totalTested === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No test data found across any meetings.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Overview ─────────────────────────────────────────────── */}
          {activeTab === "Overview" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ChartCard title="Tests per Meeting" height={280}>
                <BarChart data={meetingChartData} margin={{ top: 0, right: 8, left: -20, bottom: 50 }}>
                  {sharedXAxis}{sharedYAxis}
                  <Tooltip />
                  <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Tested" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Positives" fill="#f87171" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ChartCard>

              <ChartCard title="Positive Rate per Meeting (%)" height={280}>
                {rateData.length < 2
                  ? <Empty message="Need at least 2 meetings with data." />
                  : <LineChart data={rateData} margin={{ top: 0, right: 8, left: -20, bottom: 50 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      {sharedXAxis}
                      <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, "auto"]} />
                      <Tooltip formatter={(v) => [`${v}%`, "Positive Rate"]} />
                      <Line type="monotone" dataKey="Positive %" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4, fill: "#f59e0b" }} />
                    </LineChart>
                }
              </ChartCard>
            </div>
          )}

          {/* ── Races ────────────────────────────────────────────────── */}
          {activeTab === "Races" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ChartCard title="Tests by Race Number" height={280}>
                {data.raceStats.length === 0
                  ? <Empty />
                  : <BarChart data={data.raceStats} margin={{ top: 0, right: 8, left: -20, bottom: 8 }}>
                      <XAxis dataKey="race" tick={{ fontSize: 11 }} />
                      {sharedYAxis}
                      <Tooltip />
                      <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Tested" fill="#818cf8" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Positives" fill="#f87171" radius={[3, 3, 0, 0]} />
                    </BarChart>
                }
              </ChartCard>

              <ChartCard title="Positive Rate by Race Number (%)" height={280}>
                {data.raceStats.length < 2
                  ? <Empty />
                  : <LineChart
                      data={data.raceStats.map((r) => ({
                        race: r.race,
                        "Positive %": r.Tested > 0 ? parseFloat(((r.Positives / r.Tested) * 100).toFixed(1)) : 0,
                      }))}
                      margin={{ top: 0, right: 8, left: -20, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="race" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, "auto"]} />
                      <Tooltip formatter={(v) => [`${v}%`, "Positive Rate"]} />
                      <Line type="monotone" dataKey="Positive %" stroke="#a78bfa" strokeWidth={2} dot={{ r: 4, fill: "#a78bfa" }} />
                    </LineChart>
                }
              </ChartCard>
            </div>
          )}

          {/* ── Drivers ──────────────────────────────────────────────── */}
          {activeTab === "Drivers" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ChartCard title="Most Tested Drivers (Top 15)" height={340}>
                {data.driverStats.length === 0
                  ? <Empty />
                  : <BarChart
                      data={data.driverStats}
                      layout="vertical"
                      margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
                    >
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="driver" tick={{ fontSize: 10 }} width={110} />
                      <Tooltip />
                      <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Tests" fill="#34d399" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="Positives" fill="#f87171" radius={[0, 3, 3, 0]} />
                    </BarChart>
                }
              </ChartCard>

              <ChartCard title="Tests vs Positives per Driver (Top 15)" height={340}>
                {data.driverStats.length === 0
                  ? <Empty />
                  : <LineChart
                      data={data.driverStats}
                      margin={{ top: 0, right: 24, left: -10, bottom: 60 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="driver" tick={{ fontSize: 9 }} angle={-40} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="Tests" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Positives" stroke="#f87171" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                }
              </ChartCard>
            </div>
          )}

          {/* ── Trends ───────────────────────────────────────────────── */}
          {activeTab === "Trends" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ChartCard title="Monthly Tests & Positives" height={280}>
                {data.monthStats.length < 2
                  ? <Empty />
                  : <LineChart data={data.monthStats} margin={{ top: 0, right: 8, left: -20, bottom: 44 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="Tested" stroke="#38bdf8" strokeWidth={2} dot={{ r: 4, fill: "#38bdf8" }} />
                      <Line type="monotone" dataKey="Positives" stroke="#f87171" strokeWidth={2} dot={{ r: 4, fill: "#f87171" }} />
                    </LineChart>
                }
              </ChartCard>

              <ChartCard title="Cumulative Tests Over Season" height={280}>
                {data.cumulativeStats.length < 2
                  ? <Empty />
                  : <AreaChart data={data.cumulativeStats} margin={{ top: 0, right: 8, left: -20, bottom: 50 }}>
                      <defs>
                        <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      {sharedXAxis}
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Area type="monotone" dataKey="Total" stroke="#38bdf8" strokeWidth={2} fill="url(#cumGrad)" dot={{ r: 3, fill: "#38bdf8" }} />
                    </AreaChart>
                }
              </ChartCard>

              <ChartCard title="Monthly Positive Rate Trend (%)" height={260}>
                {data.monthStats.length < 2
                  ? <Empty />
                  : <AreaChart
                      data={data.monthStats.map((m) => ({
                        month: m.month,
                        "Positive %": m.Tested > 0 ? parseFloat(((m.Positives / m.Tested) * 100).toFixed(1)) : 0,
                      }))}
                      margin={{ top: 0, right: 8, left: -20, bottom: 44 }}
                    >
                      <defs>
                        <linearGradient id="rateGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, "auto"]} />
                      <Tooltip formatter={(v) => [`${v}%`, "Positive Rate"]} />
                      <Area type="monotone" dataKey="Positive %" stroke="#f59e0b" strokeWidth={2} fill="url(#rateGrad)" dot={{ r: 3, fill: "#f59e0b" }} />
                    </AreaChart>
                }
              </ChartCard>

              <ChartCard title="Tests per Meeting (Line)" height={260}>
                <LineChart data={meetingChartData} margin={{ top: 0, right: 8, left: -20, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  {sharedXAxis}
                  {sharedYAxis}
                  <Tooltip />
                  <Legend verticalAlign="top" height={26} wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Tested" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Positives" stroke="#f87171" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ChartCard>
            </div>
          )}
        </>
      )}
    </div>
  );
}
