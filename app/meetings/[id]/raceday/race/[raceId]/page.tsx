"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Meeting = {
  id: string;
  title: string | null;
  meeting_date: string | null;
};

type Race = {
  id: string;
  meeting_id: string;
  race_number: number;
  race_time: string | null;
  race_distance: string | null;
  race_class: string | null;
};

type Entry = {
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

type EditableRow = {
  entry_id: string;
  gate: string;
  horse_name: string;
  scratched: boolean;
  driver_mode: "linked" | "raw";
  driver_id: string;
  driver_name_raw: string;
  current_driver_name: string;
  current_driver_id_card: string | null;
  current_driver_phone: string | null;
  driver_search: string;
  show_driver_results: boolean;
  saving: boolean;
};

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

function formatMeetingLabel(meeting: Meeting | null) {
  if (!meeting) return "Meeting";

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

function getSingleParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeSearch(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export default function EditRacePage() {
  const params = useParams();
  const router = useRouter();

  const meetingId = getSingleParam(params.id as string | string[] | undefined);
  const raceId = getSingleParam(params.raceId as string | string[] | undefined);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [race, setRace] = useState<Race | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState(true);

  const buildRows = useCallback(
  (entries: Entry[], allDrivers: Driver[]): EditableRow[] => {
    const driverMap = new Map(
      allDrivers.map((driver) => [
        driver.id,
        {
          full_name: driver.full_name,
          id_card: driver.id_card,
          phone: driver.phone,
        },
      ])
    );

    return entries.map((entry) => {
      const linkedDriver =
        entry.driver_id && driverMap.has(entry.driver_id)
          ? driverMap.get(entry.driver_id)!
          : null;

      const currentDriverName = entry.scratched
        ? "—"
        : entry.driver_name_raw
          ? entry.driver_name_raw
          : linkedDriver
            ? linkedDriver.full_name
            : "NOT DECLARED";

      return {
        entry_id: entry.id,
        gate: entry.gate != null ? String(entry.gate) : "",
        horse_name: entry.horse_name || "",
        scratched: !!entry.scratched,
        driver_mode: (!entry.driver_id && !!entry.driver_name_raw ? "raw" : "linked") as
  | "linked"
  | "raw",
        driver_id: entry.driver_id || "",
        driver_name_raw: entry.driver_name_raw || "",
        current_driver_name: currentDriverName,
        current_driver_id_card: entry.scratched ? null : linkedDriver?.id_card || null,
        current_driver_phone: entry.scratched ? null : linkedDriver?.phone || null,
        driver_search: linkedDriver
          ? `${linkedDriver.full_name}${linkedDriver.id_card ? ` — ${linkedDriver.id_card}` : ""}`
          : "",
        show_driver_results: false,
        saving: false,
      };
    });
  }, []);

  const loadPage = useCallback(async () => {
    if (!meetingId || !raceId) {
      alert("Missing meeting ID or race ID.");
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data: meetingData, error: meetingError } = await supabase
      .from("meetings")
      .select("id,title,meeting_date")
      .eq("id", meetingId)
      .single();

    if (meetingError) {
      alert(meetingError.message);
      setLoading(false);
      return;
    }

    const { data: raceData, error: raceError } = await supabase
      .from("races")
      .select("id,meeting_id,race_number,race_time,race_distance,race_class")
      .eq("id", raceId)
      .eq("meeting_id", meetingId)
      .single();

    if (raceError) {
      alert(raceError.message);
      setLoading(false);
      return;
    }

    const { data: entriesData, error: entriesError } = await supabase
      .from("entries")
      .select("id,race_id,gate,horse_name,scratched,driver_id,driver_name_raw")
      .eq("race_id", raceId)
      .order("gate", { ascending: true });

    if (entriesError) {
      alert(entriesError.message);
      setLoading(false);
      return;
    }

    const { data: driversData, error: driversError } = await supabase
      .from("drivers")
      .select("id,full_name,id_card,phone")
      .order("full_name", { ascending: true });

    if (driversError) {
      alert(driversError.message);
      setLoading(false);
      return;
    }

    const entries = (entriesData as Entry[]) || [];
    const allDrivers = (driversData as Driver[]) || [];

    setMeeting(meetingData as Meeting);
    setRace(raceData as Race);
    setDrivers(allDrivers);
    setRows(buildRows(entries, allDrivers));
    setLoading(false);
  }, [buildRows, meetingId, raceId]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.replace("/");
        return;
      }

      if (!mounted) return;
      await loadPage();
    })();

    return () => {
      mounted = false;
    };
  }, [loadPage, router]);

  useEffect(() => {
    if (!raceId) return;

    const channel = supabase
      .channel(`edit-race-${raceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "entries",
          filter: `race_id=eq.${raceId}`,
        },
        async () => {
          await loadPage();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "drivers",
        },
        async () => {
          await loadPage();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [raceId, loadPage]);

  const raceColor = useMemo(() => {
    if (!race) {
      return { bg: "#E5E7EB", text: "#111111", border: "#CBD5E1" };
    }

    return getRaceColor(race.race_number);
  }, [race]);

  function updateRow(entryId: string, patch: Partial<EditableRow>) {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.entry_id === entryId ? { ...row, ...patch } : row
      )
    );
  }

  function closeAllDriverResultsExcept(entryId: string) {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.entry_id === entryId
          ? row
          : { ...row, show_driver_results: false }
      )
    );
  }

  function chooseLinkedDriver(entryId: string, driver: Driver) {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.entry_id === entryId
          ? {
              ...row,
              driver_mode: "linked",
              driver_id: driver.id,
              driver_name_raw: "",
              driver_search: `${driver.full_name}${driver.id_card ? ` — ${driver.id_card}` : ""}`,
              show_driver_results: false,
            }
          : row
      )
    );
  }

  async function saveRow(row: EditableRow) {
    updateRow(row.entry_id, { saving: true, show_driver_results: false });

    const trimmedGate = row.gate.trim();
    const parsedGate =
      trimmedGate === "" ? null : Number.parseInt(trimmedGate, 10);

    if (trimmedGate !== "" && Number.isNaN(parsedGate)) {
      updateRow(row.entry_id, { saving: false });
      alert("Gate must be a valid number.");
      return;
    }

    let nextDriverId: string | null = null;
    let nextDriverNameRaw: string | null = null;

    if (!row.scratched) {
      if (row.driver_mode === "linked") {
        nextDriverId = row.driver_id || null;
        nextDriverNameRaw = null;
      } else {
        nextDriverId = null;
        nextDriverNameRaw = row.driver_name_raw.trim() || null;
      }
    }

    const { error } = await supabase
      .from("entries")
      .update({
        gate: parsedGate,
        horse_name: row.horse_name.trim() || null,
        scratched: row.scratched,
        driver_id: nextDriverId,
        driver_name_raw: nextDriverNameRaw,
      })
      .eq("id", row.entry_id);

    updateRow(row.entry_id, { saving: false });

    if (error) {
      alert(error.message);
      return;
    }

    await loadPage();
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/meetings/${meetingId}/raceday`)}
          >
            Back to RaceDay
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push(`/meetings/${meetingId}`)}
          >
            Meeting
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-3">
                <div
                  className="inline-flex rounded-xl border px-5 py-2"
                  style={{
                    backgroundColor: raceColor.bg,
                    color: raceColor.text,
                    borderColor: raceColor.border,
                  }}
                >
                  <span className="text-3xl font-extrabold tracking-tight">
                    {race ? `Edit Race ${race.race_number}` : "Edit Race"}
                  </span>
                </div>

                <div className="space-y-1">
                  <p className="text-base font-medium">{formatMeetingLabel(meeting)}</p>
                  <p className="text-sm text-muted-foreground">
                    {race
                      ? [race.race_time, race.race_distance, race.race_class]
                          .filter(Boolean)
                          .join(" • ") || "No extra info yet"
                      : "Loading..."}
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading race...</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No entries found for this race.
              </p>
            ) : (
              <div className="space-y-4">
                {rows.map((row, index) => {
                  const searchValue = normalizeSearch(row.driver_search);

                  const filteredDrivers =
                    row.driver_mode === "linked"
                      ? drivers
                          .filter((driver) => {
                            if (!searchValue) return true;

                            const name = normalizeSearch(driver.full_name);
                            const idCard = normalizeSearch(driver.id_card);
                            const phone = normalizeSearch(driver.phone);

                            return (
                              name.includes(searchValue) ||
                              idCard.includes(searchValue) ||
                              phone.includes(searchValue)
                            );
                          })
                          .slice(0, 12)
                      : [];

                  const selectedDriver =
                    row.driver_mode === "linked"
                      ? drivers.find((driver) => driver.id === row.driver_id) || null
                      : null;

                  const previewDriverName = row.scratched
                    ? "—"
                    : row.driver_mode === "raw"
                      ? row.driver_name_raw.trim() || "NOT DECLARED"
                      : selectedDriver?.full_name || "NOT DECLARED";

                  const previewIdCard = row.scratched
                    ? "—"
                    : row.driver_mode === "linked"
                      ? selectedDriver?.id_card || "No ID found"
                      : "No linked driver";

                  const previewPhone = row.scratched
                    ? "—"
                    : row.driver_mode === "linked"
                      ? selectedDriver?.phone || "No phone found"
                      : "No linked driver";

                  return (
                    <Card key={row.entry_id}>
                      <CardHeader>
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <h2 className="text-lg font-semibold">Entry {index + 1}</h2>
                            <p className="text-sm text-muted-foreground">
                              Current:{" "}
                              {row.scratched
                                ? `SCRATCHED${row.horse_name ? ` — ${row.horse_name}` : ""}`
                                : row.horse_name || "Unnamed horse"}
                            </p>
                          </div>

                          <div className="text-sm text-muted-foreground">
                            {row.scratched ? "Scratched" : previewDriverName}
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-5">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Gate</label>
                            <input
                              type="number"
                              value={row.gate}
                              onChange={(e) =>
                                updateRow(row.entry_id, { gate: e.target.value })
                              }
                              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                              placeholder="Gate"
                            />
                          </div>

                          <div className="space-y-2 xl:col-span-2">
                            <label className="text-sm font-medium">Horse name</label>
                            <input
                              type="text"
                              value={row.horse_name}
                              onChange={(e) =>
                                updateRow(row.entry_id, { horse_name: e.target.value })
                              }
                              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                              placeholder="Horse name"
                            />
                          </div>

                          <div className="flex items-end">
                            <label className="inline-flex items-center gap-2 text-sm font-medium">
                              <input
                                type="checkbox"
                                checked={row.scratched}
                                onChange={(e) =>
                                  updateRow(row.entry_id, {
                                    scratched: e.target.checked,
                                    show_driver_results: false,
                                  })
                                }
                              />
                              Scratched
                            </label>
                          </div>
                        </div>

                        {!row.scratched && (
                          <>
                            <div className="flex flex-wrap gap-4 text-sm">
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="radio"
                                  name={`driver-mode-${row.entry_id}`}
                                  checked={row.driver_mode === "linked"}
                                  onChange={() =>
                                    updateRow(row.entry_id, {
                                      driver_mode: "linked",
                                      show_driver_results: false,
                                    })
                                  }
                                />
                                Linked driver
                              </label>

                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="radio"
                                  name={`driver-mode-${row.entry_id}`}
                                  checked={row.driver_mode === "raw"}
                                  onChange={() =>
                                    updateRow(row.entry_id, {
                                      driver_mode: "raw",
                                      show_driver_results: false,
                                    })
                                  }
                                />
                                Custom name
                              </label>
                            </div>

                            {row.driver_mode === "linked" ? (
                              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                <div className="space-y-2 xl:col-span-2">
                                  <label className="text-sm font-medium">
                                    Search linked driver
                                  </label>

                                  <div className="relative">
                                    <input
                                      type="text"
                                      value={row.driver_search}
                                      onFocus={() => {
                                        closeAllDriverResultsExcept(row.entry_id);
                                        updateRow(row.entry_id, {
                                          show_driver_results: true,
                                        });
                                      }}
                                      onChange={(e) => {
                                        closeAllDriverResultsExcept(row.entry_id);
                                        updateRow(row.entry_id, {
                                          driver_search: e.target.value,
                                          show_driver_results: true,
                                          driver_id: "",
                                        });
                                      }}
                                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                      placeholder="Type driver name, ID card, or phone"
                                    />

                                    {row.show_driver_results && (
                                      <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-background shadow-lg">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateRow(row.entry_id, {
                                              driver_id: "",
                                              driver_search: "",
                                              show_driver_results: false,
                                            })
                                          }
                                          className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-muted"
                                        >
                                          No linked driver
                                        </button>

                                        {filteredDrivers.length === 0 ? (
                                          <div className="px-3 py-2 text-sm text-muted-foreground">
                                            No matching drivers found.
                                          </div>
                                        ) : (
                                          filteredDrivers.map((driver) => (
                                            <button
                                              key={driver.id}
                                              type="button"
                                              onClick={() =>
                                                chooseLinkedDriver(row.entry_id, driver)
                                              }
                                              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                                            >
                                              <div className="font-medium">
                                                {driver.full_name}
                                              </div>
                                              <div className="text-xs text-muted-foreground">
                                                {driver.id_card || "No ID"}
                                                {driver.phone ? ` • ${driver.phone}` : ""}
                                              </div>
                                            </button>
                                          ))
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <label className="text-sm font-medium">ID Card</label>
                                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                                    {previewIdCard}
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <label className="text-sm font-medium">Phone</label>
                                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                                    {previewPhone}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <label className="text-sm font-medium">
                                  Custom driver name
                                </label>
                                <input
                                  type="text"
                                  value={row.driver_name_raw}
                                  onChange={(e) =>
                                    updateRow(row.entry_id, {
                                      driver_name_raw: e.target.value,
                                    })
                                  }
                                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                  placeholder="Enter driver name"
                                />
                              </div>
                            )}
                          </>
                        )}

                        <div className="grid gap-4 md:grid-cols-4">
                          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                            <span className="font-medium">Preview driver:</span>{" "}
                            <span className="text-muted-foreground">
                              {previewDriverName}
                            </span>
                          </div>

                          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                            <span className="font-medium">Preview ID:</span>{" "}
                            <span className="text-muted-foreground">
                              {previewIdCard}
                            </span>
                          </div>

                          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                            <span className="font-medium">Preview phone:</span>{" "}
                            <span className="text-muted-foreground">
                              {previewPhone}
                            </span>
                          </div>

                          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                            <span className="font-medium">Status:</span>{" "}
                            <span className="text-muted-foreground">
                              {row.scratched
                                ? "Scratched"
                                : previewDriverName === "NOT DECLARED"
                                  ? "No driver"
                                  : "Ready"}
                            </span>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <Button
                            onClick={() => saveRow(row)}
                            disabled={row.saving}
                          >
                            {row.saving ? "Saving..." : "Save row"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}