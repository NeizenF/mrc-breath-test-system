"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { toast } from "sonner";

type Meeting = {
  id: string;
  title: string | null;
  meeting_date: string | null;
  is_archived?: boolean;
};

type Race = {
  id: string;
  race_number: number;
  race_time: string | null;
  race_distance: string | null;
  race_class: string | null;
  race_name: string | null;
  qualifiers: number | null;
  qualifiers_next_stage: string | null;
};

type EntryRow = {
  id: string;
  race_id: string;
  gate: number | null;
  horse_name: string | null;
  scratched: boolean | null;
  driver_id: string | null;
  driver_name_raw: string | null;
};

type Driver = {
  id: string;
  full_name: string;
  id_card: string | null;
  phone: string | null;
};

type TestRow = {
  id: string;
  entry_id: string;
  meeting_id?: string;
  tested: boolean;
  tested_at: string | null;
  tested_by: string | null;
  result: "negative" | "positive" | null;
};

type Row = {
  entry_id: string;
  race_id: string;
  race_number: number;
  gate: number | null;
  horse_name: string | null;
  scratched: boolean;
  driver_id: string | null;
  driver_name_raw: string | null;
  driver_name: string;
  driver_id_card: string | null;
  driver_phone: string | null;
  tested: boolean;
  tested_at: string | null;
  result: "negative" | "positive" | null;
};

function formatMeetingLabel(meeting: Meeting) {
  const title = meeting.title?.trim();

  const date = meeting.meeting_date
    ? new Date(meeting.meeting_date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "No date";

  return title ? `${title} — ${date}` : date;
}

function getRaceColor(raceNumber: number) {
  const colorMap: Record<number, { bg: string; text: string; border: string }> = {
    1: { bg: "#FFF200", text: "#111111", border: "#D4C900" },
    2: { bg: "#8B0094", text: "#FFFFFF", border: "#6D0074" },
    3: { bg: "#F7A600", text: "#111111", border: "#CC8800" },
    4: { bg: "#8E8E8E", text: "#FFFFFF", border: "#707070" },
    5: { bg: "#F52D8A", text: "#FFFFFF", border: "#D21F72" },
    6: { bg: "#48C9C0", text: "#111111", border: "#33AFA7" },
    7: { bg: "#B22626", text: "#FFFFFF", border: "#8E1E1E" },
    8: { bg: "#FF120A", text: "#FFFFFF", border: "#CC0E08" },
    9: { bg: "#000000", text: "#FFFFFF", border: "#000000" },
    10: { bg: "#E7E4CD", text: "#111111", border: "#CCC8AE" },
    11: { bg: "#1200FF", text: "#FFFFFF", border: "#0E00CC" },
  };

  return (
    colorMap[raceNumber] || {
      bg: "#E5E7EB",
      text: "#111111",
      border: "#CBD5E1",
    }
  );
}

export default function RaceDayPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const meetingId = params.id;
  const scrolledRef = useRef(false);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [allMeetings, setAllMeetings] = useState<Meeting[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<"connecting" | "live" | "offline">(
    "connecting"
  );
  const [busyEntryIds, setBusyEntryIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [matchIndex, setMatchIndex] = useState(-1);
  const [now, setNow] = useState(() => new Date());
  const [clockPos, setClockPos] = useState<{ x: number; y: number } | null>(null);
  const clockRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setClockPos({ x: window.innerWidth - 200, y: window.innerHeight - 110 });
  }, []);

  // Attach native (non-passive) listeners on the clock element to prevent page scroll while dragging
  useEffect(() => {
    const el = clockRef.current;
    if (!el) return;

    function onMouseDown(e: MouseEvent) {
      draggingRef.current = true;
      dragOffsetRef.current = { x: e.clientX - (clockPos?.x ?? 0), y: e.clientY - (clockPos?.y ?? 0) };
      e.preventDefault();
    }
    function onTouchStart(e: TouchEvent) {
      draggingRef.current = true;
      dragOffsetRef.current = {
        x: e.touches[0].clientX - (clockPos?.x ?? 0),
        y: e.touches[0].clientY - (clockPos?.y ?? 0),
      };
      e.preventDefault();
    }

    el.addEventListener("mousedown", onMouseDown);
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      el.removeEventListener("touchstart", onTouchStart);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockPos]);

  useEffect(() => {
    function onMove(e: MouseEvent | TouchEvent) {
      if (!draggingRef.current) return;
      e.preventDefault();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      setClockPos({ x: clientX - dragOffsetRef.current.x, y: clientY - dragOffsetRef.current.y });
    }
    function onUp() { draggingRef.current = false; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, []);

  const loadMeetingsList = useCallback(async () => {
    setMeetingsLoading(true);

    const { data, error } = await supabase
      .from("meetings")
      .select("id,title,meeting_date,is_archived")
      .eq("is_archived", false)
      .order("meeting_date", { ascending: false, nullsFirst: false })
      .order("title", { ascending: true });

    if (error) {
      console.error("Error loading meetings list:", error);
      setAllMeetings([]);
    } else {
      setAllMeetings((data as Meeting[]) || []);
    }

    setMeetingsLoading(false);
  }, []);

  const loadMeetingAndRaces = useCallback(async () => {
    const [{ data: meetingData, error: meetingError }, { data: raceData, error: raceError }] =
      await Promise.all([
        supabase
          .from("meetings")
          .select("id,title,meeting_date,is_archived")
          .eq("id", meetingId)
          .single(),
        supabase
          .from("races")
          .select("id,race_number,race_time,race_distance,race_class,race_name,qualifiers,qualifiers_next_stage")
          .eq("meeting_id", meetingId)
          .order("race_number", { ascending: true }),
      ]);

    if (meetingError) {
      toast.error(meetingError.message);
      setMeeting(null);
      setRaces([]);
      setLoading(false);
      return;
    }

    if (raceError) {
      toast.error(raceError.message);
      setMeeting(meetingData as Meeting);
      setRaces([]);
      setLoading(false);
      return;
    }

    setMeeting(meetingData as Meeting);
    setRaces((raceData as Race[]) || []);
  }, [meetingId]);

  const loadAllRaceData = useCallback(
    async (allRaces: Race[]) => {
      setLoading(true);

      if (allRaces.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const raceIds = allRaces.map((r) => r.id);

      const { data: entriesData, error: entriesError } = await supabase
        .from("entries")
        .select("id,race_id,gate,horse_name,scratched,driver_id,driver_name_raw")
        .in("race_id", raceIds)
        .order("gate", { ascending: true });

      if (entriesError) {
        toast.error(entriesError.message);
        setLoading(false);
        return;
      }

      const entries = (entriesData as EntryRow[]) || [];
      const driverIds = [
        ...new Set(entries.map((e) => e.driver_id).filter(Boolean)),
      ] as string[];
      const entryIds = entries.map((e) => e.id);

      const [{ data: driversData, error: driversError }, { data: testsData, error: testsError }] =
        await Promise.all([
          driverIds.length > 0
            ? supabase.from("drivers").select("id,full_name,id_card,phone").in("id", driverIds)
            : Promise.resolve({ data: [] as Driver[], error: null }),
          entryIds.length > 0
            ? supabase
                .from("tests")
                .select("id,entry_id,tested,tested_at,tested_by,meeting_id,result")
                .eq("meeting_id", meetingId)
                .in("entry_id", entryIds)
            : Promise.resolve({ data: [] as TestRow[], error: null }),
        ]);

      const drivers: Driver[] = (!driversError && driversData ? driversData : []) as Driver[];
      const tests: TestRow[] = (!testsError && testsData ? testsData : []) as TestRow[];

      const driverMap = new Map(
        drivers.map((d) => [
          d.id,
          {
            name: d.full_name,
            id_card: d.id_card,
            phone: d.phone,
          },
        ])
      );

      const testMap = new Map(tests.map((t) => [t.entry_id, t]));
      const raceMap = new Map(allRaces.map((r) => [r.id, r.race_number]));

      const builtRows: Row[] = entries
        .map((entry) => {
          const test = testMap.get(entry.id);

          const driverInfo =
            entry.driver_id && driverMap.get(entry.driver_id)
              ? driverMap.get(entry.driver_id)!
              : null;

          const driverName = entry.driver_name_raw
            ? entry.driver_name_raw
            : driverInfo
            ? driverInfo.name
            : "NOT DECLARED";

          return {
            entry_id: entry.id,
            race_id: entry.race_id,
            race_number: raceMap.get(entry.race_id) || 0,
            gate: entry.gate,
            horse_name: entry.horse_name,
            scratched: !!entry.scratched,
            driver_id: entry.driver_id,
            driver_name_raw: entry.driver_name_raw,
            driver_name: driverName,
            driver_id_card: driverInfo?.id_card || null,
            driver_phone: driverInfo?.phone || null,
            tested: !!test?.tested,
            tested_at: test?.tested_at || null,
            result: test?.result || null,
          };
        })
        .sort((a, b) => {
          if (a.race_number !== b.race_number) {
            return a.race_number - b.race_number;
          }
          return (a.gate ?? 999) - (b.gate ?? 999);
        });

      setRows(builtRows);
      setLoading(false);
    },
    [meetingId]
  );

  const reloadEverything = useCallback(async () => {
    await Promise.all([loadMeetingsList(), loadMeetingAndRaces()]);
  }, [loadMeetingsList, loadMeetingAndRaces]);

  function applyTestChangeToRows(testRow: {
    entry_id: string;
    tested: boolean;
    tested_at: string | null;
    result: "negative" | "positive" | null;
  }) {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.entry_id === testRow.entry_id
          ? {
              ...row,
              tested: !!testRow.tested,
              tested_at: testRow.tested_at || null,
              result: testRow.result || null,
            }
          : row
      )
    );
  }

  async function setResultForRow(
    row: Row,
    nextResult: "negative" | "positive" | null
  ) {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Failed to read session:", sessionError);
      toast.error("Could not verify your session. Please log in again.");
      await supabase.auth.signOut();
      router.replace("/");
      return;
    }

    if (!session?.user?.id) {
      toast.error("Your session has expired. Please log in again.");
      await supabase.auth.signOut();
      router.replace("/");
      return;
    }

    const currentUserId = session.user.id;
    setUserId(currentUserId);

    const newTestedValue = nextResult !== null;
    const newTestedAt = nextResult !== null ? new Date().toISOString() : null;

    const relatedRows = rows.filter((currentRow) => {
      if (currentRow.scratched) return false;
      if (currentRow.driver_name === "NOT DECLARED") return false;

      if (row.driver_id && currentRow.driver_id) {
        return currentRow.driver_id === row.driver_id;
      }

      return currentRow.driver_name === row.driver_name;
    });

    if (relatedRows.length === 0) return;

    const relatedEntryIds = relatedRows.map((relatedRow) => relatedRow.entry_id);
    setBusyEntryIds(relatedEntryIds);

    const payload = relatedRows.map((relatedRow) => ({
      meeting_id: meetingId,
      entry_id: relatedRow.entry_id,
      tested: newTestedValue,
      tested_at: newTestedAt,
      tested_by: newTestedValue ? currentUserId : null,
      result: nextResult,
    }));

    const { error } = await supabase
      .from("tests")
      .upsert(payload, { onConflict: "meeting_id,entry_id" });

    if (error) {
      console.error("Set result failed:", error);

      const message = (error.message || "").toLowerCase();
      const code = "code" in error ? String(error.code || "") : "";

      if (
        code === "401" ||
        message.includes("jwt") ||
        message.includes("session") ||
        message.includes("not authenticated") ||
        message.includes("invalid token") ||
        message.includes("permission denied") ||
        message.includes("row-level security")
      ) {
        toast.error("Your session has expired or access was denied. Please log in again.");
        await supabase.auth.signOut();
        router.replace("/");
        setBusyEntryIds([]);
        return;
      }

      toast.error(error.message);
      setBusyEntryIds([]);
      return;
    }

    const relatedEntryIdSet = new Set(relatedEntryIds);

    setRows((currentRows) =>
      currentRows.map((currentRow) =>
        relatedEntryIdSet.has(currentRow.entry_id)
          ? {
              ...currentRow,
              tested: newTestedValue,
              tested_at: newTestedAt,
              result: nextResult,
            }
          : currentRow
      )
    );

    setBusyEntryIds([]);
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.replace("/");
        return;
      }

      if (!mounted) return;

      setUserId(data.user.id);
      await reloadEverything();
    })();

    return () => {
      mounted = false;
    };
  }, [meetingId, reloadEverything, router]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session?.user) {
        setUserId(null);
        router.replace("/");
      } else {
        setUserId(session.user.id);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (races.length > 0) {
      loadAllRaceData(races);
    } else {
      setRows([]);
      setLoading(false);
    }
  }, [races, meetingId, loadAllRaceData]);

  useEffect(() => {
    if (loading || scrolledRef.current) return;
    const raceParam = searchParams.get("race");
    if (!raceParam) return;
    const el = document.getElementById(`race-${raceParam}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      scrolledRef.current = true;
    }
  }, [loading, searchParams]);

  useEffect(() => {
    if (!meetingId) return;

    setLiveStatus("connecting");

    const channel = supabase
      .channel(`raceday-live-${meetingId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tests",
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          const changed = payload.new || payload.old;

          if (
            changed &&
            typeof changed === "object" &&
            "entry_id" in changed &&
            "tested" in changed
          ) {
            applyTestChangeToRows({
              entry_id: String(changed.entry_id),
              tested: Boolean(changed.tested),
              tested_at:
                "tested_at" in changed && changed.tested_at
                  ? String(changed.tested_at)
                  : null,
              result:
                "result" in changed &&
                (changed.result === "negative" || changed.result === "positive")
                  ? changed.result
                  : null,
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meetings",
          filter: `id=eq.${meetingId}`,
        },
        async () => {
          await reloadEverything();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "races",
          filter: `meeting_id=eq.${meetingId}`,
        },
        async () => {
          await reloadEverything();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "entries",
        },
        async () => {
          await reloadEverything();
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLiveStatus("live");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setLiveStatus("offline");
        } else {
          setLiveStatus("connecting");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [meetingId, reloadEverything]);

  const heading = useMemo(() => {
    if (!meeting) return "RaceDay";
    return meeting.title || `Meeting ${meeting.meeting_date || ""}`;
  }, [meeting]);

  function parseRaceDateTime(meetingDate: string, raceTime: string): Date | null {
    const t = raceTime.trim();

    // Extract HH:MM and optional am/pm from anywhere in the string
    const m = t.match(/(\d{1,2})[:\.](\d{2})(?:\s*(am|pm))?/i);
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

  const nextRaceInfo = useMemo(() => {
    if (!meeting?.meeting_date || !races.length) return null;
    let fallback: { race: Race; diffMs: number } | null = null;
    for (const race of races) {
      if (!race.race_time) continue;
      const dt = parseRaceDateTime(meeting.meeting_date, race.race_time);
      if (!dt) continue;
      const diffMs = dt.getTime() - now.getTime();
      if (diffMs > 0) return { race, diffMs };
      // Keep track of the most recent past race as fallback
      if (!fallback || diffMs > fallback.diffMs) fallback = { race, diffMs };
    }
    return fallback;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, races, meeting]);

  function formatCountdown(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  const rowsByRace = useMemo(() => {
    const grouped = new Map<number, Row[]>();

    for (const race of races) {
      grouped.set(race.race_number, []);
    }

    for (const row of rows) {
      const current = grouped.get(row.race_number) || [];
      current.push(row);
      grouped.set(row.race_number, current);
    }

    return grouped;
  }, [rows, races]);

  const raceProgress = useMemo(() => {
    return races.map((race) => {
      const raceRows = rowsByRace.get(race.race_number) || [];

      const resultableRows = raceRows.filter(
        (row) => !row.scratched && row.driver_name !== "NOT DECLARED"
      );

      const completedCount = resultableRows.filter((row) => row.result !== null).length;
      const totalCount = resultableRows.length;
      const allDone = totalCount > 0 && completedCount === totalCount;

      return {
        raceId: race.id,
        raceNumber: race.race_number,
        completedCount,
        totalCount,
        allDone,
      };
    });
  }, [races, rowsByRace]);

  const overallProgress = useMemo(() => {
    const total = raceProgress.reduce((s, r) => s + r.totalCount, 0);
    const completed = raceProgress.reduce((s, r) => s + r.completedCount, 0);
    return { total, completed };
  }, [raceProgress]);

  const matchingEntryIds = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    const ids: string[] = [];
    for (const race of races) {
      const raceRows = rowsByRace.get(race.race_number) || [];
      for (const row of raceRows) {
        if (
          row.horse_name?.toLowerCase().includes(term) ||
          row.driver_name?.toLowerCase().includes(term)
        ) {
          ids.push(row.entry_id);
        }
      }
    }
    return ids;
  }, [search, races, rowsByRace]);

  // Reset when search changes — no scroll, just reset position
  useEffect(() => { setMatchIndex(-1); }, [search]);

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && matchingEntryIds.length > 0) {
      e.preventDefault();
      const next = matchIndex === -1 ? 0 : (matchIndex + 1) % matchingEntryIds.length;
      setMatchIndex(next);
      document.getElementById(`entry-${matchingEntryIds[next]}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function highlight(text: string): React.ReactNode {
    const term = search.trim();
    if (!term) return text;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = text.split(new RegExp(`(${escaped})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === term.toLowerCase() ? (
        <mark key={i} className="rounded-sm bg-yellow-200 px-0.5 dark:bg-yellow-700 dark:text-white">
          {part}
        </mark>
      ) : (
        part
      )
    );
  }

  function handleMeetingChange(nextMeetingId: string) {
    if (!nextMeetingId || nextMeetingId === meetingId) return;
    router.push(`/meetings/${nextMeetingId}/raceday`);
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <Breadcrumbs items={[
          { label: "Meetings", href: "/admin/meetings" },
          { label: heading, href: `/meetings/${meetingId}` },
          { label: "RaceDay" },
        ]} />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">{heading}</h1>
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  {liveStatus === "live" && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${
                      liveStatus === "live"
                        ? "bg-green-500"
                        : liveStatus === "offline"
                        ? "bg-red-500"
                        : "bg-yellow-400"
                    }`}
                  />
                </span>
                <span
                  className={`text-xs font-medium ${
                    liveStatus === "live"
                      ? "text-green-700"
                      : liveStatus === "offline"
                      ? "text-red-700"
                      : "text-yellow-700"
                  }`}
                >
                  {liveStatus === "live"
                    ? "Live"
                    : liveStatus === "offline"
                    ? "Offline"
                    : "Connecting..."}
                </span>
              </span>
            </div>

            <p className="text-sm text-muted-foreground">RaceDay control panel</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Home
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push(`/meetings/${meetingId}`)}
            >
              Meeting
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open(`/meetings/${meetingId}/raceday/clock`, "raceclock", "width=700,height=400,resizable=yes")}
            >
              Clock ↗
            </Button>
          </div>
        </div>

        {meeting?.is_archived && (
          <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
            This meeting is archived. Results are read-only.
          </div>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <label htmlFor="meeting-select" className="text-sm font-medium">
                Meeting
              </label>

              <select
                id="meeting-select"
                value={meetingId}
                onChange={(e) => handleMeetingChange(e.target.value)}
                disabled={meetingsLoading}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:max-w-md"
              >
                {meetingsLoading ? (
                  <option value={meetingId}>Loading meetings...</option>
                ) : (
                  <>
                    {meeting && !allMeetings.find((m) => m.id === meetingId) && (
                      <option value={meetingId}>
                        {formatMeetingLabel(meeting)} (archived)
                      </option>
                    )}
                    {allMeetings.map((item) => (
                      <option key={item.id} value={item.id}>
                        {formatMeetingLabel(item)}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>
          </CardContent>
        </Card>

        {!loading && rows.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="relative w-full sm:max-w-sm">
              <input
                type="search"
                placeholder="Search driver or horse… (Enter to jump)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="w-full rounded-xl border bg-white dark:bg-slate-900 px-4 py-2.5 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 pr-20"
              />
              {search && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <span className="text-xs text-slate-400 tabular-nums">
                    {matchingEntryIds.length > 0
                      ? matchIndex === -1
                        ? `${matchingEntryIds.length} found`
                        : `${matchIndex + 1}/${matchingEntryIds.length}`
                      : "no match"}
                  </span>
                  <button
                    onClick={() => setSearch("")}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          </div>
        )}


        {!loading && overallProgress.total > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Meeting progress</span>
              <span className="text-muted-foreground">
                {overallProgress.completed}/{overallProgress.total} tested
                {overallProgress.completed === overallProgress.total && " ✓"}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${
                  overallProgress.completed === overallProgress.total
                    ? "bg-green-500"
                    : "bg-blue-500"
                }`}
                style={{ width: `${(overallProgress.completed / overallProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {!loading && races.length > 0 && (
          <div className="space-y-2 text-sm">
            <p className="text-sm font-medium text-muted-foreground">Race progress</p>

            <div className="grid grid-cols-3 gap-x-6 gap-y-2 md:grid-cols-5 lg:grid-cols-7">
              {raceProgress.map((item) => {
                const raceColor = getRaceColor(item.raceNumber);

                return (
                  <div key={item.raceId} className="flex items-center gap-2">
                    <button
                      className="inline-flex min-w-[42px] items-center justify-center rounded-md border px-2 py-1 text-xs font-bold transition-opacity hover:opacity-75"
                      style={{
                        backgroundColor: raceColor.bg,
                        color: raceColor.text,
                        borderColor: raceColor.border,
                      }}
                      onClick={() => {
                        document
                          .getElementById(`race-${item.raceNumber}`)
                          ?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                    >
                      R{item.raceNumber}
                    </button>

                    <span className="text-muted-foreground">
                      {item.allDone ? "✓" : `${item.completedCount}/${item.totalCount}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {loading && (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <Skeleton className="h-12 w-32 rounded-xl" />
                    <Skeleton className="h-20 w-40 rounded-xl" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((j) => (
                      <Skeleton key={j} className="h-12 w-full rounded-lg" />
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && races.length === 0 && (
          <Card>
            <CardContent className="py-6">
              <p className="text-sm text-muted-foreground">
                No races found for this meeting.
              </p>
            </CardContent>
          </Card>
        )}

        {!loading &&
          <div className="space-y-6">
          {races.map((race) => {
            const raceRows = rowsByRace.get(race.race_number) || [];

            const resultableRows = raceRows.filter(
              (row) => !row.scratched && row.driver_name !== "NOT DECLARED"
            );

            const completedCount = resultableRows.filter(
              (row) => row.result !== null
            ).length;
            const totalCount = resultableRows.length;
            const allDone = totalCount > 0 && completedCount === totalCount;
            const raceColor = getRaceColor(race.race_number);

            return (
              <Card key={race.id} id={`race-${race.race_number}`} className="animate-in fade-in duration-300">
                <CardHeader>
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div
                        className="inline-flex rounded-xl border px-5 py-2"
                        style={{
                          backgroundColor: raceColor.bg,
                          color: raceColor.text,
                          borderColor: raceColor.border,
                        }}
                      >
                        <span className="text-3xl font-extrabold tracking-tight">
                          Race {race.race_number}
                        </span>
                      </div>

                      <div className="min-w-[150px] space-y-2 text-right">
                        <div className="rounded-xl border bg-muted/40 px-4 py-3">
                          {allDone ? (
                            <>
                              <p className="text-sm font-medium text-green-600">All results entered</p>
                              <p className="text-xs text-muted-foreground">{completedCount} / {totalCount}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-lg font-bold">{completedCount} / {totalCount}</p>
                              <p className="text-xs text-muted-foreground">results entered</p>
                            </>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => router.push(`/meetings/${meetingId}/raceday/race/${race.id}`)}
                        >
                          Edit race
                        </Button>
                      </div>
                    </div>

                    {/* Centred race name + qualifiers */}
                    <p className="text-center text-sm text-muted-foreground">
                      {[race.race_time, race.race_distance, race.race_class].filter(Boolean).join(" • ") || "No extra info yet"}
                    </p>
                    {(race.race_name || race.qualifiers) && (
                      <div className="flex flex-col items-center gap-2">
                        {race.race_name && (
                          <p className="text-center text-xl font-bold text-slate-800 dark:text-slate-200">
                            {race.race_name}
                          </p>
                        )}
                        {race.qualifiers && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 dark:bg-amber-950 px-4 py-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
                            🏆 Top {race.qualifiers} advance{race.qualifiers_next_stage ? ` to ${race.qualifiers_next_stage}` : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent>
                  {raceRows.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <span className="text-3xl">🏇</span>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No entries yet</p>
                      <p className="text-xs text-muted-foreground">Import from MRC or add entries manually.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="px-3 py-2 font-medium">Gate</th>
                            <th className="px-3 py-2 font-medium">Horse</th>
                            <th className="px-3 py-2 font-medium">Driver</th>
                            <th className="hidden px-3 py-2 font-medium md:table-cell">ID Card</th>
                            <th className="hidden px-3 py-2 font-medium md:table-cell">Phone</th>
                            <th className="px-3 py-2 font-medium">Result</th>
                            <th className="hidden px-3 py-2 font-medium md:table-cell">Recorded at</th>
                            <th className="px-3 py-2 font-medium">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {raceRows.map((row) => {
                            const isBusy = busyEntryIds.includes(row.entry_id);

                            const isActiveMatch =
                              matchIndex !== -1 &&
                              matchingEntryIds[matchIndex] === row.entry_id;

                            return (
                              <tr
                                key={row.entry_id}
                                id={`entry-${row.entry_id}`}
                                className={`border-b align-middle transition-colors ${
                                  isActiveMatch
                                    ? "ring-2 ring-inset ring-yellow-400 bg-yellow-50 dark:bg-yellow-950/40"
                                    : row.scratched && row.result === "positive"
                                    ? "bg-red-200 opacity-80"
                                    : row.scratched
                                    ? "bg-gray-200 opacity-70"
                                    : row.driver_name === "NOT DECLARED"
                                    ? "bg-orange-100"
                                    : row.result === "positive"
                                    ? "bg-red-50"
                                    : row.result === "negative"
                                    ? "bg-green-50"
                                    : ""
                                }`}
                              >
                                <td className="px-3 py-3">
                                  {row.gate !== null ? (
                                    <span
                                      className="inline-flex h-7 w-7 items-center justify-center rounded font-bold text-xs"
                                      style={{
                                        backgroundColor: raceColor.bg,
                                        color: raceColor.text,
                                        border: `1px solid ${raceColor.border}`,
                                      }}
                                    >
                                      {row.gate}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-3 font-medium">
                                  {row.scratched
                                    ? <>SCRATCHED{row.horse_name ? <> — {highlight(row.horse_name)}</> : ""}</>
                                    : highlight(row.horse_name || "Unnamed horse")}
                                </td>
                                <td className="px-3 py-3">
                                  {row.driver_name ? highlight(row.driver_name) : "—"}
                                </td>
                                <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                                  {row.driver_id
                                    ? row.driver_id_card || "No ID found"
                                    : "—"}
                                </td>
                                <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                                  {row.driver_id
                                    ? row.driver_phone || "No phone found"
                                    : "—"}
                                </td>
                                <td className="px-3 py-3 font-medium">
                                  {row.result === "negative"
                                    ? "Negative"
                                    : row.result === "positive"
                                    ? "Positive"
                                    : row.scratched
                                    ? "Scratched"
                                    : row.driver_name === "NOT DECLARED"
                                    ? "No driver"
                                    : "Pending"}
                                </td>
                                <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                                  {row.tested_at
                                    ? new Date(row.tested_at).toLocaleTimeString()
                                    : "—"}
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      variant={
                                        row.result === "negative" ? "default" : "outline"
                                      }
                                      onClick={() => setResultForRow(row, "negative")}
                                      disabled={
                                        isBusy ||
                                        row.scratched ||
                                        row.driver_name === "NOT DECLARED"
                                      }
                                      className="min-w-[96px]"
                                    >
                                      {isBusy && row.result !== "negative"
                                        ? "Saving..."
                                        : "Negative"}
                                    </Button>

                                    <Button
                                      variant={
                                        row.result === "positive" ? "destructive" : "outline"
                                      }
                                      onClick={() => setResultForRow(row, "positive")}
                                      disabled={
                                        isBusy ||
                                        row.scratched ||
                                        row.driver_name === "NOT DECLARED"
                                      }
                                      className="min-w-[96px]"
                                    >
                                      {isBusy && row.result !== "positive"
                                        ? "Saving..."
                                        : "Positive"}
                                    </Button>

                                    <Button
                                      variant="outline"
                                      onClick={() => setResultForRow(row, null)}
                                      disabled={
                                        isBusy ||
                                        row.scratched ||
                                        row.driver_name === "NOT DECLARED"
                                      }
                                      className="min-w-[80px]"
                                    >
                                      Clear
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          </div>}
      </div>

      {/* Draggable 7-segment clock */}
      {clockPos && (
        <div
          ref={clockRef}
          className="fixed z-50 select-none cursor-grab active:cursor-grabbing"
          style={{ left: clockPos.x, top: clockPos.y }}
        >
          <div
            className="dseg dseg7"
            style={{
              fontFamily: "'DSEG7-Classic', monospace",
              fontSize: "2.5rem",
              color: "#ff2200",
              textShadow: "0 0 8px rgba(255,34,0,0.7), 0 0 20px rgba(255,34,0,0.4)",
              background: "transparent",
              letterSpacing: "0.05em",
            }}
          >
            {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      )}
    </div>
  );
} 