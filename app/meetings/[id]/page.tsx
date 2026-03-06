"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { normalizeName } from "@/lib/normalizeName";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateLong } from "@/lib/formatters";

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

type ImportedEntry = {
  gate: number;
  horse_name: string;
  driver_name_raw: string | null;
  scratched: boolean;
};

type DriverMatch = {
  id: string;
  full_name: string;
  id_card: string | null;
  phone: string | null;
};

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meetingId = params.id;
  const bulkUrlsStorageKey = `bulk-mrc-urls-${meetingId}`;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingMrc, setUpdatingMrc] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkUrls, setBulkUrls] = useState("");

  async function load() {
    setLoading(true);

    const { data: m, error: meetingError } = await supabase
      .from("meetings")
      .select("id,title,meeting_date")
      .eq("id", meetingId)
      .single();

    if (meetingError) {
      alert(meetingError.message);
      setLoading(false);
      return;
    }

    const { data: r, error: racesError } = await supabase
      .from("races")
      .select("id,race_number,race_time,race_distance,race_class")
      .eq("meeting_id", meetingId)
      .order("race_number", { ascending: true });

    if (racesError) {
      alert(racesError.message);
      setLoading(false);
      return;
    }

    setMeeting((m as Meeting) || null);
    setRaces((r as Race[]) || []);
    setLoading(false);
  }

  async function createRaces() {
    const nStr = prompt("How many races? (e.g. 10)");
    if (!nStr) return;

    const n = Number(nStr);
    if (!Number.isFinite(n) || n < 1 || n > 30) {
      alert("Enter a number between 1 and 30.");
      return;
    }

    const existing = new Set(races.map((x) => x.race_number));
    const toInsert = Array.from({ length: n }, (_, i) => i + 1)
      .filter((num) => !existing.has(num))
      .map((num) => ({
        meeting_id: meetingId,
        race_number: num,
      }));

    if (toInsert.length === 0) {
      alert("Those races already exist.");
      return;
    }

    const { error } = await supabase.from("races").insert(toInsert);
    if (error) {
      alert(error.message);
      return;
    }

    await load();
  }

  async function importSingleMrcUrl(url: string) {
    const res = await fetch("/api/mrc-import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || "Import failed.");
    }

    const raceNumber = result.race_number as number | null;
    const raceTime = (result.race_time as string | null) ?? null;
    const raceDistance = (result.race_distance as string | null) ?? null;
    const raceClass = (result.race_class as string | null) ?? null;
    const importedEntries = (result.entries || []) as ImportedEntry[];

    if (!raceNumber) {
      throw new Error("Could not detect the race number from the MRC page.");
    }

    if (importedEntries.length === 0) {
      throw new Error(`No entries found for race ${raceNumber}.`);
    }

    let raceId: string | null = null;

    const { data: existingRace, error: raceFindError } = await supabase
      .from("races")
      .select("id")
      .eq("meeting_id", meetingId)
      .eq("race_number", raceNumber)
      .maybeSingle();

    if (raceFindError) {
      throw new Error(raceFindError.message);
    }

    if (existingRace?.id) {
      raceId = existingRace.id;

      const { error: updateRaceError } = await supabase
        .from("races")
        .update({
          race_time: raceTime,
          race_distance: raceDistance,
          race_class: raceClass,
        })
        .eq("id", raceId);

      if (updateRaceError) {
        throw new Error(updateRaceError.message);
      }
    } else {
      const { data: newRace, error: raceInsertError } = await supabase
        .from("races")
        .insert({
          meeting_id: meetingId,
          race_number: raceNumber,
          race_time: raceTime,
          race_distance: raceDistance,
          race_class: raceClass,
        })
        .select("id")
        .single();

      if (raceInsertError) {
        throw new Error(raceInsertError.message);
      }

      raceId = newRace.id;
    }

    const { data: allDrivers, error: driversError } = await supabase
      .from("drivers")
      .select("id,full_name,id_card,phone");

    if (driversError) {
      throw new Error(driversError.message);
    }

    const drivers = ((allDrivers as DriverMatch[]) || []).map((driver) => ({
      ...driver,
      normalized_full_name: normalizeName(driver.full_name || ""),
    }));

    for (const item of importedEntries) {
      let matchedDriverId: string | null = null;

      if (!item.scratched && item.driver_name_raw) {
        const normalizedImportedName = normalizeName(item.driver_name_raw);

        const matchedDriver = drivers.find(
          (driver) => driver.normalized_full_name === normalizedImportedName
        );

        matchedDriverId = matchedDriver?.id ?? null;
      }

      const { error } = await supabase.from("entries").upsert(
        {
          race_id: raceId,
          gate: item.gate,
          horse_name: item.horse_name,
          driver_name_raw: item.driver_name_raw,
          driver_id: item.scratched ? null : matchedDriverId,
          scratched: item.scratched,
        },
        { onConflict: "race_id,gate" }
      );

      if (error) {
        throw new Error(error.message);
      }
    }

    return { raceNumber, importedCount: importedEntries.length };
  }

  async function updateFromMrc() {
    const url = prompt("Paste the MRC race link");
    if (!url) return;

    setUpdatingMrc(true);

    try {
      const result = await importSingleMrcUrl(url);
      await load();
      alert(`Imported ${result.importedCount} entries for race ${result.raceNumber}.`);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setUpdatingMrc(false);
    }
  }

  async function bulkUpdateFromMrc() {
    const urls = bulkUrls
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      alert("Paste at least one race link.");
      return;
    }

    setBulkImporting(true);

    try {
      const results: string[] = [];

      for (const url of urls) {
        const result = await importSingleMrcUrl(url);
        results.push(`Race ${result.raceNumber}: ${result.importedCount} entries`);
      }

      await load();
      alert(`Bulk import complete.\n\n${results.join("\n")}`);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Bulk import failed.");
    } finally {
      setBulkImporting(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }

      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  useEffect(() => {
    if (!meetingId) return;

    const saved = localStorage.getItem(bulkUrlsStorageKey);
    if (saved) {
      setBulkUrls(saved);
    }
  }, [meetingId, bulkUrlsStorageKey]);

  useEffect(() => {
    if (!meetingId) return;

    localStorage.setItem(bulkUrlsStorageKey, bulkUrls);
  }, [bulkUrls, meetingId, bulkUrlsStorageKey]);

  const title = useMemo(() => {
    if (!meeting) return "Meeting";
    return meeting.title ?? `Meeting ${meeting.meeting_date ?? ""}`.trim();
  }, [meeting]);

  return (
    <div className="min-h-screen p-6 bg-muted/30">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">
              {meeting?.meeting_date
                ? `Date: ${formatDateLong(meeting.meeting_date)}`
                : "—"}
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/")}>
              Home
            </Button>

            <Button variant="outline" onClick={() => router.push("/meetings")}>
              Meetings
            </Button>

            <Button
              variant="outline"
              onClick={updateFromMrc}
              disabled={updatingMrc || bulkImporting}
            >
              {updatingMrc ? "Updating..." : "Update one race"}
            </Button>

            <Button onClick={createRaces}>Create races</Button>

            <Button
  variant="outline"
  onClick={() => router.push(`/meetings/${meetingId}/print`)}
>
  Print page
</Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Bulk import from MRC</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paste one MRC race link per line. They now stay saved for this meeting,
              even after refresh.
            </p>

            <textarea
              value={bulkUrls}
              onChange={(e) => setBulkUrls(e.target.value)}
              placeholder={`https://maltaracingclub.com/...\nhttps://maltaracingclub.com/...\nhttps://maltaracingclub.com/...`}
              className="min-h-[140px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />

            <div className="flex gap-2">
              <Button onClick={bulkUpdateFromMrc} disabled={bulkImporting || updatingMrc}>
                {bulkImporting ? "Importing..." : "Import all links"}
              </Button>

              <Button
                variant="outline"
                onClick={() => setBulkUrls("")}
                disabled={bulkImporting}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Races</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {loading && (
              <span className="text-sm text-muted-foreground">Loading…</span>
            )}

            {!loading && races.length === 0 && (
              <span className="text-sm text-muted-foreground">
                No races yet. Click “Create races” or import from MRC.
              </span>
            )}

            {races.map((r) => (
              <Button
                key={r.id}
                variant="secondary"
                className="h-auto justify-between py-3"
                onClick={() =>
                  router.push(`/meetings/${meetingId}/raceday?race=${r.race_number}`)
                }
              >
                <div className="flex flex-col items-start text-left">
                  <span className="font-medium">Race {r.race_number}</span>
                  <span className="text-xs text-muted-foreground">
                    {[r.race_time, r.race_distance, r.race_class]
                      .filter(Boolean)
                      .join(" • ") || "No extra info yet"}
                  </span>
                </div>

                <span className="ml-2 rounded-md border px-2 py-1 text-xs">
                  Open
                </span>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}