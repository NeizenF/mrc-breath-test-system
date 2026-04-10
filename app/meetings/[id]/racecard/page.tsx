"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
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
  race_name: string | null;
  qualifiers: number | null;
  qualifiers_next_stage: string | null;
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
};

type RaceEntry = {
  gate: number | null;
  horse: string;
  driver: string;
  scratched: boolean;
};

type RaceWithEntries = Race & { entries: RaceEntry[] };

export default function RaceCardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meetingId = params.id;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [races, setRaces] = useState<RaceWithEntries[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) { router.replace("/"); return; }

      const [{ data: m }, { data: racesData }] = await Promise.all([
        supabase.from("meetings").select("id,title,meeting_date").eq("id", meetingId).single(),
        supabase.from("races").select("id,race_number,race_time,race_distance,race_class,race_name,qualifiers,qualifiers_next_stage")
          .eq("meeting_id", meetingId).order("race_number", { ascending: true }),
      ]);

      if (!m || !racesData) { setLoading(false); return; }
      setMeeting(m as Meeting);

      const raceList = racesData as Race[];
      const raceIds = raceList.map((r) => r.id);

      if (raceIds.length === 0) { setRaces([]); setLoading(false); return; }

      const { data: entriesData } = await supabase
        .from("entries")
        .select("id,race_id,gate,horse_name,scratched,driver_id,driver_name_raw")
        .in("race_id", raceIds)
        .order("gate", { ascending: true });

      const entries = (entriesData as Entry[]) ?? [];
      const driverIds = [...new Set(entries.map((e) => e.driver_id).filter(Boolean))] as string[];

      let driverMap = new Map<string, string>();
      if (driverIds.length > 0) {
        const { data: driversData } = await supabase
          .from("drivers").select("id,full_name").in("id", driverIds);
        driverMap = new Map((driversData as Driver[] ?? []).map((d) => [d.id, d.full_name]));
      }

      const built: RaceWithEntries[] = raceList.map((race) => {
        const raceEntries = entries
          .filter((e) => e.race_id === race.id)
          .sort((a, b) => (a.gate ?? 999) - (b.gate ?? 999))
          .map((e) => ({
            gate: e.gate,
            horse: e.horse_name ?? "—",
            driver: e.driver_name_raw || (e.driver_id ? driverMap.get(e.driver_id) : null) || "Not Declared",
            scratched: e.scratched ?? false,
          }));
        return { ...race, entries: raceEntries };
      });

      setRaces(built);
      setTotalPages(built.length);
      setLoading(false);
    })();
  }, [meetingId, router]);

  if (loading) {
    return <div className="p-8 text-black">Loading race cards...</div>;
  }

  if (!meeting || races.length === 0) {
    return <div className="p-8 text-black">No races found for this meeting.</div>;
  }

  const meetingTitle = meeting.title?.trim() || "Unnamed Meeting";
  const meetingDate = meeting.meeting_date ? formatDateLong(meeting.meeting_date) : "—";

  return (
    <div className="min-h-screen bg-white text-black">
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { size: A4 portrait; margin: 10mm 12mm; }
          .race-page { page-break-after: always; }
          .race-page:last-child { page-break-after: avoid; }
          tr { page-break-inside: avoid; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Race Cards</h1>
            <p className="text-sm text-gray-500">{meetingTitle} · {meetingDate} · {totalPages} race{totalPages !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.back()}>Back</Button>
            <Button onClick={() => window.print()}>Print / Save PDF</Button>
          </div>
        </div>
      </div>

      {/* Race pages */}
      {races.map((race, idx) => (
        <div key={race.id} className="race-page mx-auto max-w-[780px] px-6 py-6">

          {/* Page header */}
          <div className="mb-4 flex items-center justify-between border-b-2 border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mrc-logo.jpg" alt="MRC" className="h-12 w-12 object-contain" />
              <div>
                <div className="text-[16px] font-bold uppercase tracking-wide text-slate-800">Malta Racing Club</div>
                <div className="text-[12px] text-slate-600">{meetingTitle} · {meetingDate}</div>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">{idx + 1}/{totalPages}</div>
          </div>

          {/* Race info band */}
          <div className="mb-4 flex flex-wrap gap-3 rounded-lg border-2 border-slate-800 overflow-hidden">
            {/* Race number block */}
            <div className="flex min-w-[70px] flex-col items-center justify-center bg-slate-800 px-4 py-3 text-white">
              <div className="text-[10px] font-semibold uppercase tracking-widest opacity-70">Race</div>
              <div className="text-[28px] font-black leading-none">{race.race_number}</div>
            </div>

            {/* Race details */}
            <div className="flex flex-1 flex-wrap gap-x-6 gap-y-1 px-4 py-3 text-[12px]">
              {race.race_time && (
                <div>
                  <span className="font-semibold text-slate-600">Time: </span>
                  <span>{race.race_time}</span>
                </div>
              )}
              {race.race_distance && (
                <div>
                  <span className="font-semibold text-slate-600">Distance: </span>
                  <span>{race.race_distance}</span>
                </div>
              )}
              {race.race_class && (
                <div>
                  <span className="font-semibold text-slate-600">Class: </span>
                  <span>{race.race_class}</span>
                </div>
              )}
              {race.race_name && (
                <div className="w-full">
                  <span className="font-semibold text-slate-600">Name: </span>
                  <span>{race.race_name}</span>
                </div>
              )}
              {race.qualifiers != null && (
                <div>
                  <span className="font-semibold text-slate-600">Qualifiers: </span>
                  <span>{race.qualifiers}{race.qualifiers_next_stage ? ` → ${race.qualifiers_next_stage}` : ""}</span>
                </div>
              )}
            </div>
          </div>

          {/* Entries table */}
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-slate-800 text-white text-left">
                <th className="border border-slate-600 px-3 py-2 w-[60px] text-center">Gate</th>
                <th className="border border-slate-600 px-3 py-2">Horse</th>
                <th className="border border-slate-600 px-3 py-2">Driver</th>
                <th className="border border-slate-600 px-3 py-2 w-[140px]">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {race.entries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="border border-slate-300 px-3 py-6 text-center text-slate-400">
                    No entries
                  </td>
                </tr>
              ) : (
                race.entries.map((entry, i) => (
                  <tr
                    key={i}
                    className={`${entry.scratched ? "bg-slate-100 opacity-60" : i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}
                  >
                    <td className="border border-slate-300 px-3 py-2 text-center font-semibold">
                      {entry.gate ?? "—"}
                    </td>
                    <td className={`border border-slate-300 px-3 py-2 ${entry.scratched ? "line-through text-slate-400" : ""}`}>
                      {entry.horse}
                    </td>
                    <td className={`border border-slate-300 px-3 py-2 ${entry.scratched ? "line-through text-slate-400" : entry.driver === "Not Declared" ? "italic text-slate-400" : ""}`}>
                      {entry.scratched ? "SCRATCHED" : entry.driver}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">&nbsp;</td>
                  </tr>
                ))
              )}
              {/* Extra blank rows for notes */}
              {Array.from({ length: Math.max(0, 3 - race.entries.length) }).map((_, i) => (
                <tr key={`blank-${i}`}>
                  <td className="border border-slate-300 px-3 py-2">&nbsp;</td>
                  <td className="border border-slate-300 px-3 py-2">&nbsp;</td>
                  <td className="border border-slate-300 px-3 py-2">&nbsp;</td>
                  <td className="border border-slate-300 px-3 py-2">&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>

        </div>
      ))}
    </div>
  );
}
