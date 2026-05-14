"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";

// ── Types ─────────────────────────────────────────────────────────────────────

type Meeting = {
  id: string;
  title: string | null;
  meeting_date: string | null;
  is_archived: boolean | null;
};

type PredictionRow = {
  driverName: string;
  firstRaceNumber: number;
  raceCount: number;
  avgGap: number | null;
  testCount: number;
  risk: "high" | "watch" | "low" | "nodata";
};

type DriverAvg = { avg: number; count: number };

// ── Constants ─────────────────────────────────────────────────────────────────

const LATE_THRESHOLD = 20;
const RISK_ORDER: Record<PredictionRow["risk"], number> = { high: 0, watch: 1, nodata: 2, low: 3 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseRaceDateTime(meetingDate: string, raceTime: string): Date | null {
  const t = raceTime.trim();
  const m = t.match(/(\d{1,2})[:.]\s*(\d{2})(?:\s*(am|pm))?/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const mer = m[3]?.toLowerCase();
  if (mer === "pm" && h !== 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  const d = new Date(`${meetingDate}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  d.setHours(h, min, 0, 0);
  return d;
}

function formatDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function pluck<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

function riskToGap(avg: number) {
  if (avg > -LATE_THRESHOLD) return "high";
  if (avg > -30) return "watch";
  return "low";
}

// ── Shared components ─────────────────────────────────────────────────────────

function RiskBadge({ risk }: { risk: PredictionRow["risk"] }) {
  const map = {
    high:   { label: "High risk",  cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
    watch:  { label: "Watch",      cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
    low:    { label: "Low risk",   cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" },
    nodata: { label: "No history", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  };
  const { label, cls } = map[risk];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function AvgGapLabel({ avg, count }: { avg: number | null; count: number }) {
  if (avg === null) return <span className="text-xs text-muted-foreground">No timing data</span>;
  const rounded = Math.round(avg);
  const color = rounded > -LATE_THRESHOLD
    ? "text-red-600 dark:text-red-400"
    : rounded > -30
    ? "text-amber-600 dark:text-amber-400"
    : "text-green-600 dark:text-green-400";
  return (
    <span className={`text-xs font-mono font-medium ${color}`}>
      avg {rounded > 0 ? "+" : ""}{rounded} min
      <span className="text-muted-foreground font-normal ml-1">({count} test{count !== 1 ? "s" : ""})</span>
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DriverRiskPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);

  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [selectedUpcoming, setSelectedUpcoming] = useState("");
  const [driverAvgMap, setDriverAvgMap] = useState<Map<string, DriverAvg> | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [predictions, setPredictions] = useState<PredictionRow[]>([]);
  const [loadingPredictions, setLoadingPredictions] = useState(false);

  // ── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session) { router.replace("/"); return; }
      const admin = await isCurrentUserAdmin();
      if (!mounted) return;
      if (!admin) { router.replace("/dashboard"); return; }
      setCheckingAccess(false);
    }
    init();
    return () => { mounted = false; };
  }, [router]);

  // ── Load historical avgs + upcoming meetings on mount ─────────────────────

  const loadHistoricalAvgs = useCallback(async () => {
    setLoadingHistory(true);

    const [{ data: allTests }, { data: allRaces }, { data: allMeetings }] = await Promise.all([
      supabase.from("tests")
        .select("tested_at,meeting_id,entry_id,entries(driver_name_raw,drivers(full_name),race_id)")
        .eq("tested", true).not("tested_at", "is", null),
      supabase.from("races").select("id,race_time,meeting_id"),
      supabase.from("meetings").select("id,meeting_date"),
    ]);

    const meetingDateMap = new Map((allMeetings ?? []).map((m) => [m.id, m.meeting_date]));
    const raceInfoMap    = new Map((allRaces ?? []).map((r) => [r.id, { race_time: r.race_time, meeting_id: r.meeting_id }]));

    const gapsPerDriver = new Map<string, number[]>();

    for (const t of allTests ?? []) {
      const row = t as { tested_at: string | null; meeting_id: string | null; entries: unknown };
      if (!row.tested_at || !row.meeting_id) continue;

      const entry = pluck(row.entries as Parameters<typeof pluck>[0]);
      if (!entry) continue;
      const e    = entry as { driver_name_raw?: string | null; drivers?: unknown; race_id?: string };
      const dr   = pluck(e.drivers as Parameters<typeof pluck>[0]);
      const name = (dr as { full_name?: string } | null)?.full_name?.trim() || e.driver_name_raw?.trim() || null;
      if (!name || !e.race_id) continue;

      const raceInfo = raceInfoMap.get(e.race_id);
      if (!raceInfo?.race_time) continue;
      // Guard: race must belong to this test's own meeting (mismatched FKs cause huge gaps)
      if (raceInfo.meeting_id && raceInfo.meeting_id !== row.meeting_id) continue;

      // Use test's meeting_id for the date — avoids stale race→meeting chain
      const meetingDate = meetingDateMap.get(row.meeting_id);
      if (!meetingDate) continue;

      const raceDt = parseRaceDateTime(meetingDate, raceInfo.race_time);
      if (!raceDt) continue;

      const gap = (new Date(row.tested_at).getTime() - raceDt.getTime()) / 60000;
      // Discard impossible values: testing window is realistically within 8h of race
      if (gap < -8 * 60 || gap > 4 * 60) continue;

      if (!gapsPerDriver.has(name)) gapsPerDriver.set(name, []);
      gapsPerDriver.get(name)!.push(gap);
    }

    const avgMap = new Map<string, DriverAvg>();
    for (const [name, gaps] of gapsPerDriver.entries()) {
      avgMap.set(name, { avg: gaps.reduce((a, b) => a + b, 0) / gaps.length, count: gaps.length });
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: upcoming } = await supabase
      .from("meetings").select("id,title,meeting_date,is_archived")
      .gte("meeting_date", today).eq("is_archived", false)
      .order("meeting_date", { ascending: true });

    setDriverAvgMap(avgMap);
    setUpcomingMeetings(upcoming ?? []);
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    if (!checkingAccess && driverAvgMap === null) {
      loadHistoricalAvgs();
    }
  }, [checkingAccess, driverAvgMap, loadHistoricalAvgs]);

  // ── Load predictions when meeting chosen ─────────────────────────────────

  useEffect(() => {
    if (!selectedUpcoming || !driverAvgMap) { setPredictions([]); return; }
    let mounted = true;
    setLoadingPredictions(true);

    async function load() {
      const { data: races } = await supabase
        .from("races").select("id,race_number").eq("meeting_id", selectedUpcoming);
      if (!mounted || !races?.length) { setPredictions([]); setLoadingPredictions(false); return; }

      const raceIds    = races.map((r) => r.id);
      const raceNumMap = new Map(races.map((r) => [r.id, r.race_number]));

      const { data: entries } = await supabase
        .from("entries").select("id,race_id,driver_name_raw,drivers(full_name)")
        .in("race_id", raceIds).or("scratched.is.null,scratched.eq.false");
      if (!mounted) return;

      const driverRaces = new Map<string, { firstRace: number; count: number }>();
      for (const e of entries ?? []) {
        const dr   = pluck(e.drivers as Parameters<typeof pluck>[0]);
        const name = (dr as { full_name?: string } | null)?.full_name?.trim() || e.driver_name_raw?.trim() || "Unknown";
        const rn   = raceNumMap.get(e.race_id) ?? 0;
        const ex   = driverRaces.get(name);
        if (!ex) { driverRaces.set(name, { firstRace: rn, count: 1 }); }
        else      { ex.count++; if (rn < ex.firstRace) ex.firstRace = rn; }
      }

      const rows: PredictionRow[] = Array.from(driverRaces.entries()).map(([driverName, info]) => {
        const history = driverAvgMap!.get(driverName) ?? null;
        return {
          driverName,
          firstRaceNumber: info.firstRace,
          raceCount: info.count,
          avgGap: history?.avg ?? null,
          testCount: history?.count ?? 0,
          risk: history ? riskToGap(history.avg) : "nodata",
        };
      });

      rows.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.firstRaceNumber - b.firstRaceNumber);
      setPredictions(rows);
      setLoadingPredictions(false);
    }

    load();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUpcoming, driverAvgMap]);

  const predHighCount  = predictions.filter((p) => p.risk === "high").length;
  const predWatchCount = predictions.filter((p) => p.risk === "watch").length;

  if (checkingAccess) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-2">
        <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Driver Risk" }]} />
      </div>
      <div className="mb-5 mt-4">
        <h1 className="text-xl font-semibold tracking-tight">Driver Risk</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Predict test punctuality for upcoming meetings based on each driver&apos;s historical average.
        </p>
      </div>

      {loadingHistory ? (
        <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
      ) : (
        <>
          <Card className="mb-6">
            <CardContent className="pt-5 pb-5">
              <label className="block mb-1.5 text-sm font-medium">Upcoming Meeting</label>
              {upcomingMeetings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming meetings found. Add future meetings in the calendar first.</p>
              ) : (
                <select value={selectedUpcoming} onChange={(e) => setSelectedUpcoming(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">— Select an upcoming meeting —</option>
                  {upcomingMeetings.map((m) => (
                    <option key={m.id} value={m.id}>{formatDate(m.meeting_date)} {m.title ? `— ${m.title}` : ""}</option>
                  ))}
                </select>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Risk is based on each driver&apos;s average test gap across {driverAvgMap?.size ?? 0} historically tracked drivers.
                <span className="ml-1 text-red-500 font-medium">High</span> = avg &lt; 20 min before race ·
                <span className="ml-1 text-amber-500 font-medium">Watch</span> = 20–30 min ·
                <span className="ml-1 text-green-600 font-medium">Low</span> = 30+ min early
              </p>
            </CardContent>
          </Card>

          {selectedUpcoming && (
            loadingPredictions ? (
              <div className="space-y-3">{[1,2,3,4].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}</div>
            ) : predictions.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No entries found for this meeting yet.</CardContent></Card>
            ) : (
              <>
                <div className="mb-5 grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "Drivers entered",  value: predictions.length,  color: "text-sky-600 dark:text-sky-400" },
                    { label: "High risk",        value: predHighCount,        color: "text-red-600 dark:text-red-400" },
                    { label: "Worth watching",   value: predWatchCount,       color: "text-amber-600 dark:text-amber-400" },
                  ].map(({ label, value, color }) => (
                    <Card key={label}><CardContent className="py-4 px-4">
                      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
                    </CardContent></Card>
                  ))}
                </div>

                <div className="space-y-2">
                  {predictions.map((p, i) => (
                    <div key={i} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border px-4 py-3 ${
                      p.risk === "high"  ? "border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20" :
                      p.risk === "watch" ? "border-amber-200 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20" :
                      "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                    }`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="shrink-0 text-xs font-medium text-muted-foreground w-14">
                          Race {p.firstRaceNumber}{p.raceCount > 1 ? ` +${p.raceCount - 1}` : ""}
                        </span>
                        <span className="font-medium text-sm truncate">{p.driverName}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <AvgGapLabel avg={p.avgGap} count={p.testCount} />
                        <RiskBadge risk={p.risk} />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )
          )}
        </>
      )}
    </div>
  );
}
