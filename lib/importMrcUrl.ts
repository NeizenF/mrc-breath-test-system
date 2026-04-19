import { supabase } from "@/lib/supabase/client";
import { normalizeName } from "@/lib/normalizeName";

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

export async function importMrcUrl(
  url: string,
  meetingId: string
): Promise<{ raceNumber: number; importedCount: number }> {
  const { data: { session } } = await supabase.auth.getSession();

  const res = await fetch("/api/mrc-import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ url }),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Import failed.");

  const raceNumber = result.race_number as number | null;
  const raceTime = (result.race_time as string | null) ?? null;
  const raceDistance = (result.race_distance as string | null) ?? null;
  const raceClass = (result.race_class as string | null) ?? null;
  const raceName = (result.race_name as string | null) ?? null;
  const qualifiersData = result.qualifiers as { count: number; nextStage: string } | null;
  const importedEntries = (result.entries || []) as ImportedEntry[];

  if (!raceNumber) throw new Error("Could not detect the race number from the MRC page.");
  if (importedEntries.length === 0) throw new Error(`No entries found for race ${raceNumber}.`);

  let raceId: string | null = null;

  const { data: existingRace, error: raceFindError } = await supabase
    .from("races")
    .select("id")
    .eq("meeting_id", meetingId)
    .eq("race_number", raceNumber)
    .maybeSingle();

  if (raceFindError) throw new Error(raceFindError.message);

  if (existingRace?.id) {
    raceId = existingRace.id;
    const { error } = await supabase.from("races").update({
      race_time: raceTime,
      race_distance: raceDistance,
      race_class: raceClass,
      race_name: raceName,
      qualifiers: qualifiersData?.count ?? null,
      qualifiers_next_stage: qualifiersData?.nextStage ?? null,
    }).eq("id", raceId);
    if (error) throw new Error(error.message);
  } else {
    const { data: newRace, error } = await supabase.from("races").insert({
      meeting_id: meetingId,
      race_number: raceNumber,
      race_time: raceTime,
      race_distance: raceDistance,
      race_class: raceClass,
      race_name: raceName,
      qualifiers: qualifiersData?.count ?? null,
      qualifiers_next_stage: qualifiersData?.nextStage ?? null,
    }).select("id").single();
    if (error) throw new Error(error.message);
    raceId = newRace.id;
  }

  const { data: allDrivers, error: driversError } = await supabase
    .from("drivers").select("id,full_name,id_card,phone");
  if (driversError) throw new Error(driversError.message);

  const drivers = ((allDrivers as DriverMatch[]) || []).map((d) => ({
    ...d,
    normalized_full_name: normalizeName(d.full_name || ""),
  }));

  const { data: allExisting } = await supabase
    .from("entries").select("id,gate,scratched").eq("race_id", raceId);

  const existing = (allExisting ?? []) as { id: string; gate: number | null; scratched: boolean | null }[];
  const activeByGate = new Map<number, string>();
  const scratchedByGate = new Map<number, string>();
  for (const e of existing) {
    if (e.gate === null) continue;
    if (!e.scratched) activeByGate.set(e.gate, e.id);
    else scratchedByGate.set(e.gate, e.id);
  }

  const processedScratchedGates = new Set<number>();

  for (const item of importedEntries) {
    let matchedDriverId: string | null = null;
    if (!item.scratched && item.driver_name_raw) {
      const norm = normalizeName(item.driver_name_raw);
      matchedDriverId = drivers.find((d) => d.normalized_full_name === norm)?.id ?? null;
    }

    const payload = {
      race_id: raceId,
      gate: item.gate,
      horse_name: item.horse_name,
      driver_name_raw: item.driver_name_raw,
      driver_id: item.scratched ? null : matchedDriverId,
      scratched: item.scratched,
    };

    if (item.scratched) {
      if (item.gate === null) continue;
      if (processedScratchedGates.has(item.gate)) continue;
      processedScratchedGates.add(item.gate);
      const existingId = activeByGate.get(item.gate) ?? scratchedByGate.get(item.gate) ?? null;
      const { error } = existingId
        ? await supabase.from("entries").update(payload).eq("id", existingId)
        : await supabase.from("entries").insert(payload);
      if (error) throw new Error(error.message);
    } else {
      const existingId = item.gate !== null ? (activeByGate.get(item.gate) ?? null) : null;
      const { error } = existingId
        ? await supabase.from("entries").update(payload).eq("id", existingId)
        : await supabase.from("entries").insert(payload);
      if (error) throw new Error(error.message);
    }
  }

  return { raceNumber, importedCount: importedEntries.length };
}
