"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";

type Meeting = {
  id: string;
  title: string | null;
  meeting_date: string | null;
  is_archived: boolean | null;
};

type DriverRow = {
  driverName: string;
  raceNumber: number;
  raceTimeLabel: string;
  testedAtLabel: string;
  gapMinutes: number | null;
  status: "on-time" | "late" | "after-start" | "unknown";
  result: "positive" | "negative" | null;
};

const LATE_THRESHOLD = 20; // minutes before race start

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

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function meetingLabel(m: Meeting) {
  const base = m.title?.trim() || formatDate(m.meeting_date);
  return m.is_archived ? `${base} [Archived]` : base;
}

function StatusBadge({ status }: { status: DriverRow["status"] }) {
  const map = {
    "on-time": { label: "On time", cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" },
    "late": { label: "Late", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
    "after-start": { label: "After start", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
    "unknown": { label: "Unknown", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  );
}

function GapLabel({ minutes }: { minutes: number | null }) {
  if (minutes === null) return <span className="text-muted-foreground text-xs">—</span>;
  if (minutes > 0) return <span className="text-red-600 dark:text-red-400 text-xs font-mono">+{minutes} min</span>;
  return <span className="text-xs font-mono text-slate-600 dark:text-slate-300">{minutes} min</span>;
}

export default function DriverRiskPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState("");
  const [selectedMeetingDate, setSelectedMeetingDate] = useState<string | null>(null);
  const [rows, setRows] = useState<DriverRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);

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

      const { data } = await supabase
        .from("meetings")
        .select("id,title,meeting_date,is_archived")
        .order("meeting_date", { ascending: false });
      if (mounted) setMeetings(data ?? []);
    }
    init();
    return () => { mounted = false; };
  }, [router]);

  useEffect(() => {
    if (!selectedMeeting) { setRows([]); return; }
    const m = meetings.find((x) => x.id === selectedMeeting);
    setSelectedMeetingDate(m?.meeting_date ?? null);

    let mounted = true;
    setLoadingRows(true);

    async function load() {
      // 1. Races for this meeting
      const { data: races } = await supabase
        .from("races")
        .select("id,race_number,race_time")
        .eq("meeting_id", selectedMeeting);

      if (!mounted) return;
      if (!races?.length) { setRows([]); setLoadingRows(false); return; }

      const raceMap = new Map(races.map((r) => [r.id, r]));
      const raceIds = races.map((r) => r.id);

      // 2. Tests (tested only) for entries in these races
      const { data: tests } = await supabase
        .from("tests")
        .select("entry_id,tested_at,result")
        .eq("meeting_id", selectedMeeting)
        .eq("tested", true)
        .not("tested_at", "is", null);

      if (!mounted) return;
      if (!tests?.length) { setRows([]); setLoadingRows(false); return; }

      const entryIds = tests.map((t) => t.entry_id).filter(Boolean);

      // 3. Entries with driver info
      const { data: entries } = await supabase
        .from("entries")
        .select("id,race_id,driver_name_raw,drivers(full_name)")
        .in("id", entryIds)
        .in("race_id", raceIds);

      if (!mounted) return;

      const entryMap = new Map(
        (entries ?? []).map((e) => {
          const dr = Array.isArray(e.drivers) ? e.drivers[0] : e.drivers;
          const name = (dr as { full_name?: string } | null)?.full_name?.trim()
            || e.driver_name_raw?.trim()
            || "Unknown";
          return [e.id, { name, raceId: e.race_id }];
        })
      );

      const meetingDate = m?.meeting_date ?? null;

      const result: DriverRow[] = tests.map((t) => {
        const entry = entryMap.get(t.entry_id);
        if (!entry) return null;

        const race = raceMap.get(entry.raceId);
        if (!race) return null;

        const raceTimeLabel = race.race_time ?? "—";
        const testedAtLabel = t.tested_at ? formatTime(t.tested_at) : "—";

        let gapMinutes: number | null = null;
        let status: DriverRow["status"] = "unknown";

        if (meetingDate && race.race_time && t.tested_at) {
          const raceDt = parseRaceDateTime(meetingDate, race.race_time);
          if (raceDt) {
            const testedDt = new Date(t.tested_at);
            gapMinutes = Math.round((testedDt.getTime() - raceDt.getTime()) / 60000);
            if (gapMinutes > 0) status = "after-start";
            else if (gapMinutes > -LATE_THRESHOLD) status = "late";
            else status = "on-time";
          }
        }

        return {
          driverName: entry.name,
          raceNumber: race.race_number,
          raceTimeLabel,
          testedAtLabel,
          gapMinutes,
          status,
          result: t.result as "positive" | "negative" | null,
        };
      }).filter((r): r is DriverRow => r !== null);

      // Sort: after-start first, then late, then on-time/unknown, then by race number
      const statusOrder = { "after-start": 0, "late": 1, "unknown": 2, "on-time": 3 };
      result.sort((a, b) =>
        statusOrder[a.status] - statusOrder[b.status] || a.raceNumber - b.raceNumber
      );

      setRows(result);
      setLoadingRows(false);
    }

    load();
    return () => { mounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMeeting]);

  const lateCount = rows.filter((r) => r.status === "late" || r.status === "after-start").length;
  const onTimeCount = rows.filter((r) => r.status === "on-time").length;
  const lateRate = rows.length > 0 ? ((lateCount / rows.length) * 100).toFixed(0) : "0";

  const summaryCards = [
    { label: "Tested", value: rows.length, color: "text-sky-600 dark:text-sky-400" },
    { label: "On Time", value: onTimeCount, color: "text-green-600 dark:text-green-400" },
    { label: `Late (< ${LATE_THRESHOLD} min)`, value: lateCount, color: "text-amber-600 dark:text-amber-400" },
    { label: "Late Rate", value: `${lateRate}%`, color: "text-red-600 dark:text-red-400" },
  ];

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
      <div className="mb-6 mt-4">
        <h1 className="text-xl font-semibold tracking-tight">Driver Risk</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Testing compliance per meeting — drivers tested less than {LATE_THRESHOLD} min before their race are flagged late.
        </p>
      </div>

      {/* Meeting selector */}
      <Card className="mb-6">
        <CardContent className="pt-5 pb-5">
          <label className="block mb-1.5 text-sm font-medium">Meeting</label>
          <select
            value={selectedMeeting}
            onChange={(e) => setSelectedMeeting(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Select a meeting —</option>
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>{meetingLabel(m)}</option>
            ))}
          </select>
          {selectedMeetingDate && (
            <p className="mt-2 text-xs text-muted-foreground">{formatDate(selectedMeetingDate)}</p>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {selectedMeeting && (
        loadingRows ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
          </div>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No test records with timestamps found for this meeting.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Summary cards */}
            <div className="mb-5 grid gap-3 sm:grid-cols-4">
              {summaryCards.map(({ label, value, color }) => (
                <Card key={label}>
                  <CardContent className="py-4 px-4">
                    <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Driver rows */}
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="shrink-0 text-xs font-medium text-muted-foreground w-14">
                      Race {r.raceNumber}
                    </span>
                    <span className="font-medium text-sm truncate">{r.driverName}</span>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex flex-col items-end text-xs text-muted-foreground gap-0.5">
                      <span>Race: <span className="font-mono text-slate-700 dark:text-slate-200">{r.raceTimeLabel}</span></span>
                      <span>Tested: <span className="font-mono text-slate-700 dark:text-slate-200">{r.testedAtLabel}</span></span>
                    </div>
                    <GapLabel minutes={r.gapMinutes} />
                    <StatusBadge status={r.status} />
                    {r.result === "positive" && (
                      <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                        Positive
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )
      )}
    </div>
  );
}
