"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Trash2, Plus } from "lucide-react";

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
  race_name: string | null;
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
  driver_search: string;
  show_driver_results: boolean;
  saving: boolean;
};

type RaceForm = {
  race_time: string;
  race_distance: string;
  race_class: string;
  race_name: string;
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
  return colorMap[raceNumber] || { bg: "#E5E7EB", text: "#111111", border: "#CBD5E1" };
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
  const [isDirty, setIsDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const [replaceConfirmEntry, setReplaceConfirmEntry] = useState<EditableRow | null>(null);
  const [deleteConfirmEntry, setDeleteConfirmEntry] = useState<EditableRow | null>(null);

  const [raceForm, setRaceForm] = useState<RaceForm>({ race_time: "", race_distance: "", race_class: "", race_name: "" });
  const [savingRace, setSavingRace] = useState(false);
  const [deleteRaceConfirm, setDeleteRaceConfirm] = useState(false);
  const [deletingRace, setDeletingRace] = useState(false);

  const buildRows = useCallback(
    (entries: Entry[], allDrivers: Driver[]): EditableRow[] => {
      const driverMap = new Map(allDrivers.map((d) => [d.id, d]));

      return entries.map((entry) => {
        const linkedDriver = entry.driver_id ? (driverMap.get(entry.driver_id) ?? null) : null;

        return {
          entry_id: entry.id,
          gate: entry.gate != null ? String(entry.gate) : "",
          horse_name: entry.horse_name || "",
          scratched: !!entry.scratched,
          driver_mode: (!entry.driver_id && !!entry.driver_name_raw ? "raw" : "linked") as "linked" | "raw",
          driver_id: entry.driver_id || "",
          driver_name_raw: entry.driver_name_raw || "",
          driver_search: linkedDriver
            ? `${linkedDriver.full_name}${linkedDriver.id_card ? ` — ${linkedDriver.id_card}` : ""}`
            : "",
          show_driver_results: false,
          saving: false,
        };
      });
    },
    []
  );

  const loadPage = useCallback(async () => {
    if (!meetingId || !raceId) {
      toast.error("Missing meeting ID or race ID.");
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
      toast.error(meetingError.message);
      setLoading(false);
      return;
    }

    const { data: raceData, error: raceError } = await supabase
      .from("races")
      .select("id,meeting_id,race_number,race_time,race_distance,race_class,race_name")
      .eq("id", raceId)
      .eq("meeting_id", meetingId)
      .single();

    if (raceError) {
      toast.error(raceError.message);
      setLoading(false);
      return;
    }

    const { data: entriesData, error: entriesError } = await supabase
      .from("entries")
      .select("id,race_id,gate,horse_name,scratched,driver_id,driver_name_raw")
      .eq("race_id", raceId)
      .order("gate", { ascending: true });

    if (entriesError) {
      toast.error(entriesError.message);
      setLoading(false);
      return;
    }

    const { data: driversData, error: driversError } = await supabase
      .from("drivers")
      .select("id,full_name,id_card,phone")
      .order("full_name", { ascending: true });

    if (driversError) {
      toast.error(driversError.message);
      setLoading(false);
      return;
    }

    const r = raceData as Race;
    setMeeting(meetingData as Meeting);
    setRace(r);
    setRaceForm({
      race_time: r.race_time ?? "",
      race_distance: r.race_distance ?? "",
      race_class: r.race_class ?? "",
      race_name: r.race_name ?? "",
    });
    setDrivers((driversData as Driver[]) || []);
    setRows(buildRows((entriesData as Entry[]) || [], (driversData as Driver[]) || []));
    setIsDirty(false);
    setLoading(false);
  }, [buildRows, meetingId, raceId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/"); return; }
      if (!mounted) return;
      await loadPage();
    })();
    return () => { mounted = false; };
  }, [loadPage, router]);

  useEffect(() => {
    if (!raceId) return;
    const channel = supabase
      .channel(`edit-race-${raceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "entries", filter: `race_id=eq.${raceId}` }, async () => { await loadPage(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, async () => { await loadPage(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [raceId, loadPage]);

  const raceColor = useMemo(() => (race ? getRaceColor(race.race_number) : { bg: "#E5E7EB", text: "#111111", border: "#CBD5E1" }), [race]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => {
      const gA = a.gate.trim() === "" ? Infinity : parseInt(a.gate, 10);
      const gB = b.gate.trim() === "" ? Infinity : parseInt(b.gate, 10);
      return gA - gB;
    }),
    [rows]
  );

  function navigate(href: string) {
    if (isDirty) { setPendingNav(href); } else { router.push(href); }
  }

  const INTERNAL_FIELDS = new Set(["show_driver_results", "saving"]);

  function updateRow(entryId: string, patch: Partial<EditableRow>) {
    const isUserEdit = Object.keys(patch).some((k) => !INTERNAL_FIELDS.has(k));
    if (isUserEdit) setIsDirty(true);
    setRows((cur) => cur.map((row) => (row.entry_id === entryId ? { ...row, ...patch } : row)));
  }

  function closeAllDriverResultsExcept(entryId: string) {
    setRows((cur) => cur.map((row) => (row.entry_id === entryId ? row : { ...row, show_driver_results: false })));
  }

  function chooseLinkedDriver(entryId: string, driver: Driver) {
    setIsDirty(true);
    setRows((cur) =>
      cur.map((row) =>
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

  async function saveRaceDetails() {
    setSavingRace(true);
    const { error } = await supabase
      .from("races")
      .update({
        race_time: raceForm.race_time.trim() || null,
        race_distance: raceForm.race_distance.trim() || null,
        race_class: raceForm.race_class.trim() || null,
        race_name: raceForm.race_name.trim() || null,
      })
      .eq("id", raceId);
    setSavingRace(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Race details saved.");
    await loadPage();
  }

  async function deleteRace() {
    setDeletingRace(true);
    setDeleteRaceConfirm(false);
    const { error: eErr } = await supabase.from("entries").delete().eq("race_id", raceId);
    if (eErr) { toast.error(eErr.message); setDeletingRace(false); return; }
    const { error } = await supabase.from("races").delete().eq("id", raceId);
    if (error) { toast.error(error.message); setDeletingRace(false); return; }
    toast.success(`Race ${race?.race_number} deleted.`);
    router.push(`/meetings/${meetingId}`);
  }

  async function addEntry() {
    const { error } = await supabase.from("entries").insert({
      race_id: raceId,
      gate: null,
      horse_name: null,
      scratched: false,
      driver_id: null,
      driver_name_raw: null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Blank entry added.");
    await loadPage();
  }

  async function replaceDriver(row: EditableRow) {
    setReplaceConfirmEntry(null);
    const { error: scratchError } = await supabase.from("entries").update({ scratched: true }).eq("id", row.entry_id);
    if (scratchError) { toast.error(scratchError.message); return; }

    const { data: gateData } = await supabase.from("entries").select("gate").eq("race_id", raceId);
    const maxGate = Math.max(0, ...((gateData || []).map((e) => e.gate).filter((g) => g != null) as number[]));

    const { error: insertError } = await supabase.from("entries").insert({
      race_id: raceId,
      gate: maxGate + 1,
      horse_name: row.horse_name.trim() || null,
      scratched: false,
      driver_id: null,
      driver_name_raw: null,
    });
    if (insertError) { toast.error(insertError.message); return; }

    toast.success("Entry scratched. New blank entry created — assign the replacement driver.");
    await loadPage();
  }

  async function deleteEntry(row: EditableRow) {
    setDeleteConfirmEntry(null);
    const { error } = await supabase.from("entries").delete().eq("id", row.entry_id);
    if (error) { toast.error(error.message); return; }
    toast.success("Entry removed.");
    await loadPage();
  }

  async function saveRow(row: EditableRow) {
    updateRow(row.entry_id, { saving: true, show_driver_results: false });

    const trimmedGate = row.gate.trim();
    const parsedGate = trimmedGate === "" ? null : Number.parseInt(trimmedGate, 10);

    if (trimmedGate !== "" && Number.isNaN(parsedGate)) {
      updateRow(row.entry_id, { saving: false });
      toast.error("Gate must be a valid number.");
      return;
    }

    let nextDriverId: string | null = null;
    let nextDriverNameRaw: string | null = null;

    if (!row.scratched) {
      if (row.driver_mode === "linked") {
        nextDriverId = row.driver_id || null;
      } else {
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

    if (error) { toast.error(error.message); return; }
    await loadPage();
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-6">
      <div className="mx-auto max-w-4xl space-y-5">

        {/* Nav */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/meetings/${meetingId}/raceday`)}>
            ← RaceDay
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/meetings/${meetingId}`)}>
            Meeting
          </Button>
        </div>

        {/* Race details card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="inline-flex rounded-lg border px-4 py-1.5"
                  style={{ backgroundColor: raceColor.bg, color: raceColor.text, borderColor: raceColor.border }}
                >
                  <span className="text-2xl font-extrabold tracking-tight">
                    Race {race?.race_number ?? "—"}
                  </span>
                </div>
                {meeting && (
                  <span className="text-sm text-muted-foreground hidden sm:block">
                    {meeting.title ?? ""}{meeting.meeting_date ? ` — ${new Date(meeting.meeting_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""}
                  </span>
                )}
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteRaceConfirm(true)}
                disabled={deletingRace || loading}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {deletingRace ? "Deleting…" : "Delete race"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Time</label>
                <Input
                  value={raceForm.race_time}
                  onChange={(e) => setRaceForm((f) => ({ ...f, race_time: e.target.value }))}
                  placeholder="e.g. 14:30"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Distance</label>
                <Input
                  value={raceForm.race_distance}
                  onChange={(e) => setRaceForm((f) => ({ ...f, race_distance: e.target.value }))}
                  placeholder="e.g. 2140m"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Class</label>
                <Input
                  value={raceForm.race_class}
                  onChange={(e) => setRaceForm((f) => ({ ...f, race_class: e.target.value }))}
                  placeholder="e.g. Class A"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</label>
                <Input
                  value={raceForm.race_name}
                  onChange={(e) => setRaceForm((f) => ({ ...f, race_name: e.target.value }))}
                  placeholder="e.g. Malta Cup"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveRaceDetails} disabled={savingRace} size="sm">
                {savingRace ? "Saving…" : "Save race details"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Entries card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Entries{!loading && ` (${rows.length})`}
              </CardTitle>
              <Button size="sm" variant="outline" onClick={addEntry} disabled={loading}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add entry
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entries yet. Click "Add entry" or import from MRC.</p>
            ) : (
              <div className="space-y-3">
                {sortedRows.map((row) => {
                  const searchValue = normalizeSearch(row.driver_search);
                  const filteredDrivers =
                    row.driver_mode === "linked"
                      ? drivers
                          .filter((d) => {
                            if (!searchValue) return true;
                            return (
                              normalizeSearch(d.full_name).includes(searchValue) ||
                              normalizeSearch(d.id_card).includes(searchValue) ||
                              normalizeSearch(d.phone).includes(searchValue)
                            );
                          })
                          .slice(0, 12)
                      : [];

                  const selectedDriver =
                    row.driver_mode === "linked" ? (drivers.find((d) => d.id === row.driver_id) ?? null) : null;

                  const resolvedName = row.scratched
                    ? "Scratched"
                    : row.driver_mode === "raw"
                    ? row.driver_name_raw.trim() || "NOT DECLARED"
                    : selectedDriver?.full_name || "NOT DECLARED";

                  const entryLabel = row.gate
                    ? `Gate ${row.gate}${row.horse_name ? ` — ${row.horse_name}` : ""}`
                    : row.horse_name || "Unassigned entry";

                  return (
                    <Card key={row.entry_id} className={row.scratched ? "opacity-60" : ""}>
                      <CardContent className="pt-4 pb-4 space-y-4">
                        {/* Entry header row */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm">{entryLabel}</span>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span>{resolvedName}</span>
                            {row.driver_mode === "linked" && selectedDriver?.id_card && !row.scratched && (
                              <span className="text-slate-400">· {selectedDriver.id_card}</span>
                            )}
                          </div>
                        </div>

                        {/* Fields grid */}
                        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground">Gate</label>
                            <Input
                              type="number"
                              value={row.gate}
                              onChange={(e) => updateRow(row.entry_id, { gate: e.target.value })}
                              placeholder="—"
                            />
                          </div>
                          <div className="space-y-1.5 sm:col-span-2">
                            <label className="text-xs font-medium text-muted-foreground">Horse name</label>
                            <Input
                              type="text"
                              value={row.horse_name}
                              onChange={(e) => updateRow(row.entry_id, { horse_name: e.target.value })}
                              placeholder="Horse name"
                            />
                          </div>
                          <div className="flex items-end pb-0.5">
                            <label className="inline-flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={row.scratched}
                                onChange={(e) => updateRow(row.entry_id, { scratched: e.target.checked, show_driver_results: false })}
                                className="h-4 w-4"
                              />
                              <span className="font-medium">Scratched</span>
                            </label>
                          </div>
                        </div>

                        {/* Driver section */}
                        {!row.scratched && (
                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-4 text-sm">
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="radio"
                                  name={`driver-mode-${row.entry_id}`}
                                  checked={row.driver_mode === "linked"}
                                  onChange={() => updateRow(row.entry_id, { driver_mode: "linked", show_driver_results: false })}
                                />
                                Linked driver
                              </label>
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="radio"
                                  name={`driver-mode-${row.entry_id}`}
                                  checked={row.driver_mode === "raw"}
                                  onChange={() => updateRow(row.entry_id, { driver_mode: "raw", show_driver_results: false })}
                                />
                                Custom name
                              </label>
                            </div>

                            {row.driver_mode === "linked" ? (
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5 relative">
                                  <label className="text-xs font-medium text-muted-foreground">Search driver</label>
                                  <Input
                                    type="text"
                                    value={row.driver_search}
                                    onFocus={() => { closeAllDriverResultsExcept(row.entry_id); updateRow(row.entry_id, { show_driver_results: true }); }}
                                    onChange={(e) => { closeAllDriverResultsExcept(row.entry_id); updateRow(row.entry_id, { driver_search: e.target.value, show_driver_results: true, driver_id: "" }); }}
                                    placeholder="Name, ID card, or phone"
                                  />
                                  {row.show_driver_results && (
                                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-background shadow-lg">
                                      <button
                                        type="button"
                                        onClick={() => updateRow(row.entry_id, { driver_id: "", driver_search: "", show_driver_results: false })}
                                        className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-muted"
                                      >
                                        No linked driver
                                      </button>
                                      {filteredDrivers.length === 0 ? (
                                        <div className="px-3 py-2 text-sm text-muted-foreground">No matches.</div>
                                      ) : (
                                        filteredDrivers.map((d) => (
                                          <button
                                            key={d.id}
                                            type="button"
                                            onClick={() => chooseLinkedDriver(row.entry_id, d)}
                                            className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                                          >
                                            <div className="font-medium">{d.full_name}</div>
                                            <div className="text-xs text-muted-foreground">
                                              {d.id_card || "No ID"}{d.phone ? ` · ${d.phone}` : ""}
                                            </div>
                                          </button>
                                        ))
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-xs font-medium text-muted-foreground">ID Card · Phone</label>
                                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground h-10 flex items-center">
                                    {selectedDriver
                                      ? `${selectedDriver.id_card || "No ID"}${selectedDriver.phone ? ` · ${selectedDriver.phone}` : ""}`
                                      : "—"}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Custom driver name</label>
                                <Input
                                  type="text"
                                  value={row.driver_name_raw}
                                  onChange={(e) => updateRow(row.entry_id, { driver_name_raw: e.target.value })}
                                  placeholder="Enter driver name"
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex justify-end gap-2 pt-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteConfirmEntry(row)}
                            disabled={row.saving}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          {!row.scratched && (
                            <Button variant="outline" size="sm" onClick={() => setReplaceConfirmEntry(row)} disabled={row.saving}>
                              Replace driver
                            </Button>
                          )}
                          <Button size="sm" onClick={() => saveRow(row)} disabled={row.saving}>
                            {row.saving ? "Saving…" : "Save"}
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

      <ConfirmDialog
        open={replaceConfirmEntry !== null}
        title="Replace driver?"
        description={`This will scratch the current entry for "${replaceConfirmEntry?.horse_name || "this horse"}" and create a new blank entry. The original test result stays attached to the scratched entry and will appear on the print.`}
        confirmLabel="Replace driver"
        onConfirm={() => replaceConfirmEntry && replaceDriver(replaceConfirmEntry)}
        onCancel={() => setReplaceConfirmEntry(null)}
      />

      <ConfirmDialog
        open={deleteConfirmEntry !== null}
        title="Remove entry?"
        description={`This will permanently delete the entry for "${deleteConfirmEntry?.horse_name || "this horse"}". Any test results will also be deleted.`}
        confirmLabel="Remove entry"
        variant="destructive"
        onConfirm={() => deleteConfirmEntry && deleteEntry(deleteConfirmEntry)}
        onCancel={() => setDeleteConfirmEntry(null)}
      />

      <ConfirmDialog
        open={deleteRaceConfirm}
        title={`Delete Race ${race?.race_number}?`}
        description={`This will permanently delete Race ${race?.race_number} and all its entries and test results. This cannot be undone.`}
        confirmLabel="Delete race"
        variant="destructive"
        onConfirm={deleteRace}
        onCancel={() => setDeleteRaceConfirm(false)}
      />

      <ConfirmDialog
        open={pendingNav !== null}
        title="Unsaved changes"
        description="You have unsaved entry changes on this page. They will be lost if you leave."
        confirmLabel="Leave anyway"
        cancelLabel="Stay"
        variant="destructive"
        onConfirm={() => {
          const href = pendingNav!;
          setPendingNav(null);
          setIsDirty(false);
          router.push(href);
        }}
        onCancel={() => setPendingNav(null)}
      />
    </div>
  );
}
