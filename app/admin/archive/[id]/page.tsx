"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { normalizeName } from "@/lib/normalizeName";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Meeting = {
  id: string;
  title: string | null;
  meeting_date: string | null;
  created_at?: string | null;
};

type Race = {
  id: string;
  meeting_id: string;
  race_number: number;
};

type Entry = {
  id: string;
  race_id: string;
  scratched: boolean | null;
  driver_id: string | null;
  driver_name_raw: string | null;
  tested?: boolean | null;
  result?: "negative" | "positive" | null;
};

type DriverRow = {
  key: string;
  name: string;
  tested: boolean;
  result: "negative" | "positive" | null;
  raceNumbers: number[];
};

function formatMeetingDate(dateStr: string | null) {
  if (!dateStr) return "No date";

  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getMeetingLabel(meeting: Meeting | null) {
  if (!meeting) return "Meeting";
  if (meeting.title && meeting.title.trim()) return meeting.title.trim();
  return formatMeetingDate(meeting.meeting_date);
}

function getDriverKey(entry: Entry) {
  if (entry.driver_id) return `id:${entry.driver_id}`;

  const raw = normalizeName(entry.driver_name_raw || "");
  if (raw) return `raw:${raw}`;

  return null;
}

function getDriverName(entry: Entry) {
  const raw = (entry.driver_name_raw || "").trim();
  if (raw) return raw;
  return "Unknown driver";
}

export default function ArchiveMeetingDetailPage() {
  const router = useRouter();
  const params = useParams();
  const meetingId =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
      ? params.id[0]
      : "";

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkAccessAndLoad() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (!session) {
          router.replace("/");
          return;
        }

        const admin = await isCurrentUserAdmin();

        if (!mounted) return;

        if (!admin) {
          router.replace("/dashboard");
          return;
        }

        setCheckingAccess(false);

        if (!meetingId) {
          setLoading(false);
          return;
        }

        setLoading(true);

        const { data: meetingData, error: meetingError } = await supabase
          .from("meetings")
          .select("id,title,meeting_date,created_at")
          .eq("id", meetingId)
          .single();

        if (meetingError) {
          console.error("Error loading meeting:", meetingError);
          if (mounted) {
            setMeeting(null);
            setDrivers([]);
            setLoading(false);
          }
          return;
        }

        const { data: racesData, error: racesError } = await supabase
          .from("races")
          .select("id,meeting_id,race_number")
          .eq("meeting_id", meetingId)
          .order("race_number", { ascending: true });

        if (racesError) {
          console.error("Error loading races:", racesError);
          if (mounted) {
            setMeeting(meetingData as Meeting);
            setDrivers([]);
            setLoading(false);
          }
          return;
        }

        const races = (racesData || []) as Race[];
        const raceIds = races.map((race) => race.id);

        let entries: Entry[] = [];

        if (raceIds.length > 0) {
          const { data: entriesData, error: entriesError } = await supabase
            .from("entries")
            .select("id,race_id,scratched,driver_id,driver_name_raw")
            .in("race_id", raceIds);

          if (entriesError) {
            console.error("Error loading entries:", entriesError);
            if (mounted) {
              setMeeting(meetingData as Meeting);
              setDrivers([]);
              setLoading(false);
            }
            return;
          }

          entries = (entriesData || []) as Entry[];

          const entryIds = entries.map((e) => e.id);
          if (entryIds.length > 0) {
            const { data: testsData } = await supabase
              .from("tests")
              .select("entry_id,tested,result")
              .eq("meeting_id", meetingId)
              .in("entry_id", entryIds);

            const testByEntry = new Map(
              (testsData || []).map((t) => [t.entry_id, t])
            );

            entries = entries.map((e) => {
              const t = testByEntry.get(e.id);
              return {
                ...e,
                tested: !!t?.tested,
                result: t?.result ?? null,
              };
            });
          }
        }

        const raceNumberById = new Map<string, number>();
        for (const race of races) {
          raceNumberById.set(race.id, race.race_number);
        }

        const driverMap = new Map<string, DriverRow>();

        for (const entry of entries) {
          if (entry.scratched) continue;

          const driverKey = getDriverKey(entry);
          if (!driverKey) continue;

          const raceNumber = raceNumberById.get(entry.race_id);
          const fallbackName = getDriverName(entry);

          const existing = driverMap.get(driverKey);

          const entryResult = (entry.result as "negative" | "positive" | null) ?? null;

          if (!existing) {
            driverMap.set(driverKey, {
              key: driverKey,
              name: fallbackName,
              tested: !!entry.tested,
              result: entryResult,
              raceNumbers: typeof raceNumber === "number" ? [raceNumber] : [],
            });
          } else {
            if (entry.tested) existing.tested = true;
            if (entryResult === "positive") existing.result = "positive";
            else if (entryResult === "negative" && existing.result !== "positive") existing.result = "negative";

            if (typeof raceNumber === "number" && !existing.raceNumbers.includes(raceNumber)) {
              existing.raceNumbers.push(raceNumber);
            }
            if (existing.name === "Unknown driver" && fallbackName !== "Unknown driver") {
              existing.name = fallbackName;
            }
          }
        }

        const driverRows = Array.from(driverMap.values())
          .map((driver) => ({
            ...driver,
            raceNumbers: [...driver.raceNumbers].sort((a, b) => a - b),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        if (mounted) {
          setMeeting(meetingData as Meeting);
          setDrivers(driverRows);
          setLoading(false);
        }
      } catch (error) {
        console.error("Failed to check admin access or load archive:", error);
        router.replace("/dashboard");
      }
    }

    checkAccessAndLoad();

    return () => {
      mounted = false;
    };
  }, [meetingId, router]);

  function downloadCSV() {
    const label = getMeetingLabel(meeting);
    const dateStr = meeting?.meeting_date
      ? new Date(meeting.meeting_date).toISOString().slice(0, 10)
      : "unknown-date";
    const filename = `${label.replace(/[^a-z0-9]/gi, "_")}_${dateStr}.csv`;

    const header = ["Driver Name", "Races", "Result"];
    const rows = drivers.map((d) => [
      d.name,
      d.raceNumbers.join("; "),
      d.result === "positive"
        ? "Positive"
        : d.result === "negative"
        ? "Negative"
        : d.tested
        ? "Tested"
        : "Not tested",
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const summary = useMemo(() => {
    const totalDrivers = drivers.length;
    const testedDrivers = drivers.filter((d) => d.tested).length;
    const untestedDrivers = totalDrivers - testedDrivers;
    const positives = drivers.filter((d) => d.result === "positive").length;
    const negatives = drivers.filter((d) => d.result === "negative").length;
    const completion = totalDrivers > 0 ? Math.round((testedDrivers / totalDrivers) * 100) : 0;

    return { totalDrivers, testedDrivers, untestedDrivers, positives, negatives, completion };
  }, [drivers]);

  if (checkingAccess) {
    return (
      <div className="mx-auto max-w-5xl p-4 md:p-6">
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Checking admin access...
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {loading ? "Loading meeting..." : getMeetingLabel(meeting)}
          </h1>
          {!loading && (
            <p className="mt-1 text-sm text-muted-foreground">
              {formatMeetingDate(meeting?.meeting_date ?? null)}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/archive">Back to Archive</Link>
          </Button>

          {!loading && meeting && (
            <Button variant="outline" onClick={downloadCSV}>
              Export CSV
            </Button>
          )}

          {meetingId && (
            <Button asChild variant="outline">
              <Link href={`/meetings/${meetingId}/print`}>Print Report</Link>
            </Button>
          )}

          {meetingId && (
            <Button asChild>
              <Link href={`/meetings/${meetingId}`}>Open Meeting</Link>
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Loading archive details...
          </CardContent>
        </Card>
      ) : !meeting ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Meeting not found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">Drivers</div>
              <div className="mt-1 text-xl font-semibold">{summary.totalDrivers}</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">Tested</div>
              <div className="mt-1 text-xl font-semibold">{summary.testedDrivers}</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">Untested</div>
              <div className="mt-1 text-xl font-semibold">{summary.untestedDrivers}</div>
            </div>
            <div className="rounded-xl border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950 p-3">
              <div className="text-xs text-green-600 dark:text-green-400">Negative</div>
              <div className="mt-1 text-xl font-semibold text-green-700 dark:text-green-300">{summary.negatives}</div>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 p-3">
              <div className="text-xs text-red-600 dark:text-red-400">Positive</div>
              <div className="mt-1 text-xl font-semibold text-red-700 dark:text-red-300">{summary.positives}</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">Completion</div>
              <div className="mt-1 text-xl font-semibold">{summary.completion}%</div>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Drivers in this meeting</CardTitle>
            </CardHeader>

            <CardContent>
              {drivers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No drivers found for this meeting.
                </p>
              ) : (
                <div className="space-y-3">
                  {drivers.map((driver) => (
                    <div
                      key={driver.key}
                      className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <div className="font-medium">{driver.name}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {driver.raceNumbers.length > 0
                            ? `Races: ${driver.raceNumbers.join(", ")}`
                            : "No race numbers"}
                        </div>
                      </div>

                      <div className={[
                        "inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium",
                        driver.result === "positive"
                          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          : driver.result === "negative"
                          ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                          : driver.tested
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                      ].join(" ")}>
                        {driver.result === "positive"
                          ? "Positive"
                          : driver.result === "negative"
                          ? "Negative"
                          : driver.tested
                          ? "Tested"
                          : "Not tested"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}