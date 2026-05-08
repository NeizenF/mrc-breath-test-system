import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  stripTags,
  parseRaceNumber,
  parseRaceTime,
  parseRaceDistance,
  parseRaceClass,
  parseRaceName,
  parseQualifiers,
  parseEntriesFromText,
  ParsedEntry,
} from "@/lib/mrcParser";
import { normalizeName } from "@/lib/normalizeName";

type DriverMatch = {
  id: string;
  full_name: string;
};

async function saveToDatabase(
  supabase: SupabaseClient,
  html: string,
  meetingId: string
): Promise<{ raceNumber: number; importedCount: number }> {
  const text = stripTags(html);

  if (/does not exist in our database/i.test(text)) {
    throw new Error("Race not found on the MRC website.");
  }

  const raceNumber = parseRaceNumber(html, text);
  if (!raceNumber) throw new Error("Could not detect the race number from the page.");

  const raceTime = parseRaceTime(text);
  const raceDistance = parseRaceDistance(text);
  const raceClass = parseRaceClass(text);
  const raceName = parseRaceName(text);
  const qualifiersData = parseQualifiers(text);
  const importedEntries = parseEntriesFromText(text);

  if (importedEntries.length === 0) throw new Error(`No entries found for race ${raceNumber}.`);

  // Upsert race
  let raceId: string;
  const { data: existingRace, error: raceFindError } = await supabase
    .from("races")
    .select("id")
    .eq("meeting_id", meetingId)
    .eq("race_number", raceNumber)
    .maybeSingle();

  if (raceFindError) throw new Error(raceFindError.message);

  const racePayload = {
    race_time: raceTime,
    race_distance: raceDistance,
    race_class: raceClass,
    race_name: raceName,
    qualifiers: qualifiersData?.count ?? null,
    qualifiers_next_stage: qualifiersData?.nextStage ?? null,
  };

  if (existingRace?.id) {
    raceId = existingRace.id;
    const { error } = await supabase.from("races").update(racePayload).eq("id", raceId);
    if (error) throw new Error(error.message);
  } else {
    const { data: newRace, error } = await supabase
      .from("races")
      .insert({ meeting_id: meetingId, race_number: raceNumber, ...racePayload })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    raceId = newRace.id;
  }

  // Fetch drivers for matching
  const { data: allDrivers, error: driversError } = await supabase
    .from("drivers")
    .select("id,full_name");
  if (driversError) throw new Error(driversError.message);

  const drivers = ((allDrivers as DriverMatch[]) || []).map((d) => ({
    ...d,
    normalized: normalizeName(d.full_name || ""),
  }));

  // Fetch existing entries
  const { data: allExisting } = await supabase
    .from("entries")
    .select("id,gate,scratched")
    .eq("race_id", raceId);

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
      matchedDriverId = drivers.find((d) => d.normalized === norm)?.id ?? null;
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

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = await req.json() as { html: string; meetingId: string };
    const { html, meetingId } = body;

    if (!html || html.trim().length < 100) {
      return NextResponse.json({ error: "HTML is too short to be valid." }, { status: 400 });
    }
    if (!meetingId) {
      return NextResponse.json({ error: "meetingId is required." }, { status: 400 });
    }

    const result = await saveToDatabase(supabase, html, meetingId);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed." },
      { status: 500 }
    );
  }
}
