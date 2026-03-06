"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Meeting = {
  id: string;
  title: string | null;
  meeting_date: string | null;
};

type Race = {
  id: string;
  race_number: number;
  race_time: string | null;
  race_distance: string | null;
  race_class: string | null;
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
  tested: boolean;
  tested_at: string | null;
  tested_by: string | null;
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

export default function RaceDayPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meetingId = params.id;

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

  const loadMeetingsList = useCallback(async () => {
    setMeetingsLoading(true);

    const { data, error } = await supabase
      .from("meetings")
      .select("id,title,meeting_date")
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
    const { data: meetingData, error: meetingError } = await supabase
      .from("meetings")
      .select("id,title,meeting_date")
      .eq("id", meetingId)
      .single();

    if (meetingError) {
      alert(meetingError.message);
      setMeeting(null);
      setRaces([]);
      setLoading(false);
      return;
    }

    const { data: raceData, error: raceError } = await supabase
      .from("races")
      .select("id,race_number,race_time,race_distance,race_class")
      .eq("meeting_id", meetingId)
      .order("race_number", { ascending: true });

    if (raceError) {
      alert(raceError.message);
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
        alert(entriesError.message);
        setLoading(false);
        return;
      }

      const entries = (entriesData as EntryRow[]) || [];
      const driverIds = [
        ...new Set(entries.map((e) => e.driver_id).filter(Boolean)),
      ] as string[];
      const entryIds = entries.map((e) => e.id);

      let drivers: Driver[] = [];
      if (driverIds.length > 0) {
        const { data: driversData, error: driversError } = await supabase
          .from("drivers")
          .select("id,full_name,id_card,phone")
          .in("id", driverIds);

        if (!driversError) {
          drivers = (driversData as Driver[]) || [];
        }
      }

      let tests: TestRow[] = [];
      if (entryIds.length > 0) {
        const { data: testsData, error: testsError } = await supabase
          .from("tests")
          .select("id,entry_id,tested,tested_at,tested_by")
          .eq("meeting_id", meetingId)
          .in("entry_id", entryIds);

        if (!testsError) {
          tests = (testsData as TestRow[]) || [];
        }
      }

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
    await loadMeetingsList();
    await loadMeetingAndRaces();
  }, [loadMeetingsList, loadMeetingAndRaces]);

  async function toggleTest(row: Row) {
    if (!userId) {
      alert("No logged-in user found.");
      return;
    }

    const newTestedValue = !row.tested;
    const newTestedAt = newTestedValue ? new Date().toISOString() : null;

    const relatedRows = rows.filter((currentRow) => {
      if (currentRow.scratched) return false;
      if (currentRow.driver_name === "NOT DECLARED") return false;

      if (row.driver_id && currentRow.driver_id) {
        return currentRow.driver_id === row.driver_id;
      }

      return currentRow.driver_name === row.driver_name;
    });

    if (relatedRows.length === 0) return;

    const payload = relatedRows.map((relatedRow) => ({
      meeting_id: meetingId,
      entry_id: relatedRow.entry_id,
      tested: newTestedValue,
      tested_at: newTestedAt,
      tested_by: newTestedValue ? userId : null,
    }));

    const { error } = await supabase
      .from("tests")
      .upsert(payload, { onConflict: "meeting_id,entry_id" });

    if (error) {
      alert(error.message);
      return;
    }

    const relatedEntryIds = new Set(
      relatedRows.map((relatedRow) => relatedRow.entry_id)
    );

    setRows((currentRows) =>
      currentRows.map((currentRow) =>
        relatedEntryIds.has(currentRow.entry_id)
          ? {
              ...currentRow,
              tested: newTestedValue,
              tested_at: newTestedAt,
            }
          : currentRow
      )
    );
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
    if (races.length > 0) {
      loadAllRaceData(races);
    } else {
      setRows([]);
      setLoading(false);
    }
  }, [races, meetingId, loadAllRaceData]);

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
        async () => {
          await reloadEverything();
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

      const testableRows = raceRows.filter(
        (row) => !row.scratched && row.driver_name !== "NOT DECLARED"
      );

      const testedCount = testableRows.filter((row) => row.tested).length;
      const totalCount = testableRows.length;
      const allTested = totalCount > 0 && testedCount === totalCount;

      return {
        raceId: race.id,
        raceNumber: race.race_number,
        testedCount,
        totalCount,
        allTested,
      };
    });
  }, [races, rowsByRace]);

  function handleMeetingChange(nextMeetingId: string) {
    if (!nextMeetingId || nextMeetingId === meetingId) return;
    router.push(`/meetings/${nextMeetingId}/raceday`);
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold">{heading}</h1>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                  liveStatus === "live"
                    ? "bg-green-100 text-green-700"
                    : liveStatus === "offline"
                      ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {liveStatus === "live"
                  ? "Live"
                  : liveStatus === "offline"
                    ? "Offline"
                    : "Connecting..."}
              </span>
            </div>

            <p className="text-sm text-muted-foreground">
              RaceDay control panel
            </p>
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
          </div>
        </div>

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
                disabled={meetingsLoading || allMeetings.length === 0}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:max-w-md"
              >
                {meetingsLoading ? (
                  <option value={meetingId}>Loading meetings...</option>
                ) : allMeetings.length === 0 ? (
                  <option value={meetingId}>No meetings found</option>
                ) : (
                  allMeetings.map((item) => (
                    <option key={item.id} value={item.id}>
                      {formatMeetingLabel(item)}
                    </option>
                  ))
                )}
              </select>
            </div>
          </CardContent>
        </Card>

        {!loading && races.length > 0 && (
          <div className="space-y-2 text-sm">
            <p className="text-sm font-medium text-muted-foreground">
              Race progress
            </p>

            <div className="grid grid-cols-3 gap-x-6 gap-y-2 md:grid-cols-5 lg:grid-cols-7">
              {raceProgress.map((item) => (
                <div key={item.raceId} className="flex items-center gap-2">
                  <span className="font-medium">R{item.raceNumber}</span>
                  <span className="text-muted-foreground">
                    {item.allTested
                      ? "✓"
                      : `${item.testedCount}/${item.totalCount}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && (
          <Card>
            <CardContent className="py-6">
              <p className="text-sm text-muted-foreground">Loading entries…</p>
            </CardContent>
          </Card>
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
          races.map((race) => {
            const raceRows = rowsByRace.get(race.race_number) || [];

            const testableRows = raceRows.filter(
              (row) => !row.scratched && row.driver_name !== "NOT DECLARED"
            );

            const testedCount = testableRows.filter((row) => row.tested).length;
            const totalCount = testableRows.length;
            const allTested = totalCount > 0 && testedCount === totalCount;

            return (
              <Card key={race.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <CardTitle className="text-3xl font-extrabold tracking-tight">
                        Race {race.race_number}
                      </CardTitle>

                      <p className="text-lg text-muted-foreground">
                        {[race.race_time, race.race_distance, race.race_class]
                          .filter(Boolean)
                          .join(" • ") || "No extra info yet"}
                      </p>
                    </div>

                    <div className="min-w-[150px] rounded-xl border bg-muted/40 px-4 py-3 text-right">
                      {allTested ? (
                        <>
                          <p className="text-sm font-medium text-green-600">
                            All tested
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {testedCount} / {totalCount}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-lg font-bold">
                            {testedCount} / {totalCount}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            tested
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {raceRows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No entries yet for this race.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b text-left">
                            <th className="px-3 py-2 font-medium">Gate</th>
                            <th className="px-3 py-2 font-medium">Horse</th>
                            <th className="px-3 py-2 font-medium">Driver</th>
                            <th className="px-3 py-2 font-medium">ID Card</th>
                            <th className="px-3 py-2 font-medium">Phone</th>
                            <th className="px-3 py-2 font-medium">Status</th>
                            <th className="px-3 py-2 font-medium">Tested at</th>
                            <th className="px-3 py-2 font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {raceRows.map((row) => (
                            <tr
                              key={row.entry_id}
                              className={`border-b align-middle ${
                                row.scratched
                                  ? "bg-gray-200 dark:bg-gray-900/40 opacity-70"
                                  : row.driver_name === "NOT DECLARED"
                                    ? "bg-orange-100 dark:bg-orange-950/40"
                                    : row.tested
                                      ? "bg-green-50 dark:bg-green-950/20"
                                      : ""
                              }`}
                            >
                              <td className="px-3 py-3">{row.gate ?? "—"}</td>
                              <td className="px-3 py-3 font-medium">
                                {row.scratched
                                  ? `SCRATCHED${row.horse_name ? ` — ${row.horse_name}` : ""}`
                                  : row.horse_name || "Unnamed horse"}
                              </td>
                              <td className="px-3 py-3">
                                {row.scratched ? "—" : row.driver_name}
                              </td>
                              <td className="px-3 py-3 text-muted-foreground">
                                {row.scratched
                                  ? "—"
                                  : row.driver_id
                                    ? row.driver_id_card || "No ID found"
                                    : "No linked driver"}
                              </td>
                              <td className="px-3 py-3 text-muted-foreground">
                                {row.scratched
                                  ? "—"
                                  : row.driver_id
                                    ? row.driver_phone || "No phone found"
                                    : "No linked driver"}
                              </td>
                              <td className="px-3 py-3">
                                {row.scratched
                                  ? "Scratched"
                                  : row.driver_name === "NOT DECLARED"
                                    ? "No driver"
                                    : row.tested
                                      ? "Tested"
                                      : "Pending"}
                              </td>
                              <td className="px-3 py-3 text-muted-foreground">
                                {row.tested_at
                                  ? new Date(row.tested_at).toLocaleTimeString()
                                  : "—"}
                              </td>
                              <td className="px-3 py-3">
                                <Button
                                  variant={row.tested ? "default" : "outline"}
                                  onClick={() => toggleTest(row)}
                                  disabled={
                                    row.scratched || row.driver_name === "NOT DECLARED"
                                  }
                                  className="min-w-[120px]"
                                >
                                  {row.scratched
                                    ? "Scratched"
                                    : row.driver_name === "NOT DECLARED"
                                      ? "No driver"
                                      : row.tested
                                        ? "Tested"
                                        : "Mark tested"}
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
      </div>
    </div>
  );
}