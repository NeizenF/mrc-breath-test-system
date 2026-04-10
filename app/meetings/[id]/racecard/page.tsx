"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { formatDateLong } from "@/lib/formatters";

type Meeting = { id: string; title: string | null; meeting_date: string | null };
type Race = {
  id: string; race_number: number; race_time: string | null;
  race_distance: string | null; race_class: string | null;
  race_name: string | null; qualifiers: number | null; qualifiers_next_stage: string | null;
};
type Entry = {
  id: string; race_id: string; gate: number | null; horse_name: string | null;
  scratched: boolean | null; driver_id: string | null; driver_name_raw: string | null;
};
type Driver = { id: string; full_name: string };
type RaceEntry = { gate: number | null; horse: string; driver: string; scratched: boolean };
type RaceWithEntries = Race & { entries: RaceEntry[] };

// Fixed mm dimensions of non-row content on each page
const PAGE_H_MM = 277;     // A4 minus 10mm top/bottom margins
const HEADER_MM = 18;      // MRC logo header
const RACE_BAND_MM = 24;   // race number + details band
const TABLE_HEAD_MM = 8;   // Gate / Horse / Driver header row
const AVAIL_MM = PAGE_H_MM - HEADER_MM - RACE_BAND_MM - TABLE_HEAD_MM; // ≈ 227mm for rows

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
        supabase.from("races")
          .select("id,race_number,race_time,race_distance,race_class,race_name,qualifiers,qualifiers_next_stage")
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
        .in("race_id", raceIds).order("gate", { ascending: true });

      const entries = (entriesData as Entry[]) ?? [];
      const driverIds = [...new Set(entries.map((e) => e.driver_id).filter(Boolean))] as string[];

      let driverMap = new Map<string, string>();
      if (driverIds.length > 0) {
        const { data: driversData } = await supabase.from("drivers").select("id,full_name").in("id", driverIds);
        driverMap = new Map((driversData as Driver[] ?? []).map((d) => [d.id, d.full_name]));
      }

      const built: RaceWithEntries[] = raceList.map((race) => ({
        ...race,
        entries: entries
          .filter((e) => e.race_id === race.id)
          .sort((a, b) => (a.gate ?? 999) - (b.gate ?? 999))
          .map((e) => ({
            gate: e.gate,
            horse: e.horse_name ?? "—",
            driver: e.driver_name_raw || (e.driver_id ? driverMap.get(e.driver_id) : null) || "Not Declared",
            scratched: e.scratched ?? false,
          })),
      }));

      setRaces(built);
      setTotalPages(built.length);
      setLoading(false);
    })();
  }, [meetingId, router]);

  if (loading) return <div className="p-8 text-black">Loading race cards...</div>;
  if (!meeting || races.length === 0) return <div className="p-8 text-black">No races found.</div>;

  const meetingTitle = meeting.title?.trim() || "Unnamed Meeting";
  const meetingDate = meeting.meeting_date ? formatDateLong(meeting.meeting_date) : "—";

  return (
    <div className="bg-white text-black">
      <style jsx global>{`
        * { box-sizing: border-box; }
        @media print {
          .no-print { display: none !important; }
          html, body { margin: 0; padding: 0; background: white !important; }
          @page { size: A4 portrait; margin: 10mm 12mm; }
          .race-page { page-break-after: always; break-after: page; }
          .race-page:last-child { page-break-after: avoid; break-after: avoid; }
          thead { display: table-header-group; }
        }
        .race-page {
          width: 100%;
          height: ${PAGE_H_MM}mm;
          display: flex;
          flex-direction: column;
          padding: 4mm 2mm;
        }
        .race-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .race-table th {
          background: #1e293b;
          color: white;
          border: 1px solid #475569;
          padding: 4px 8px;
          text-align: left;
          font-weight: 600;
          font-size: 11px;
        }
        .race-table td {
          border: 1px solid #cbd5e1;
          padding: 2px 8px;
          vertical-align: middle;
          overflow: hidden;
        }
        .race-table .col-gate { width: 52px; text-align: center; font-weight: 700; }
        .race-table .col-remarks { width: 18%; }
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

      {races.map((race, idx) => {
        const count = Math.max(race.entries.length, 1);
        const rowHeightMm = AVAIL_MM / count;
        // Font and padding scale with row height
        const fontSize = Math.min(20, Math.max(11, Math.round(11 + (rowHeightMm - 14) * 0.55)));
        const paddingV = Math.min(14, Math.max(2, Math.round((rowHeightMm - 14) * 0.35)));

        return (
          <div key={race.id} className="race-page">

            {/* MRC header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #1e293b", paddingBottom: "4px", marginBottom: "4px", height: `${HEADER_MM}mm`, flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mrc-logo.jpg" alt="MRC" style={{ height: "40px", width: "40px", objectFit: "contain" }} />
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "#1e293b" }}>Malta Racing Club</div>
                  <div style={{ fontSize: "10px", color: "#64748b" }}>{meetingTitle} · {meetingDate}</div>
                </div>
              </div>
              <div style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 500 }}>{idx + 1}/{totalPages}</div>
            </div>

            {/* Race info band */}
            <div style={{ display: "flex", border: "2px solid #1e293b", borderRadius: "5px", overflow: "hidden", marginBottom: "4px", height: `${RACE_BAND_MM}mm`, flexShrink: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#1e293b", color: "white", padding: "6px 16px", minWidth: "68px" }}>
                <div style={{ fontSize: "8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.7 }}>Race</div>
                <div style={{ fontSize: "24px", fontWeight: 900, lineHeight: 1 }}>{race.race_number}</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "1px 18px", padding: "6px 12px", fontSize: "11px", alignContent: "center" }}>
                {race.race_time && <div><strong style={{ color: "#475569" }}>Time:</strong> {race.race_time}</div>}
                {race.race_distance && <div><strong style={{ color: "#475569" }}>Distance:</strong> {race.race_distance}</div>}
                {race.race_class && <div><strong style={{ color: "#475569" }}>Class:</strong> {race.race_class}</div>}
                {race.qualifiers != null && <div><strong style={{ color: "#475569" }}>Qualifiers:</strong> {race.qualifiers}{race.qualifiers_next_stage ? ` → ${race.qualifiers_next_stage}` : ""}</div>}
                {race.race_name && <div style={{ width: "100%" }}><strong style={{ color: "#475569" }}>Name:</strong> {race.race_name}</div>}
              </div>
            </div>

            {/* Entries table */}
            <table className="race-table" style={{ flex: 1 }}>
              <thead>
                <tr style={{ height: `${TABLE_HEAD_MM}mm` }}>
                  <th className="col-gate">Gate</th>
                  <th>Horse</th>
                  <th>Driver</th>
                  <th className="col-remarks">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {race.entries.map((entry, i) => (
                  <tr key={i} style={{
                    height: `${rowHeightMm}mm`,
                    background: entry.scratched ? "#f1f5f9" : i % 2 === 0 ? "#ffffff" : "#f8fafc",
                    opacity: entry.scratched ? 0.6 : 1,
                  }}>
                    <td className="col-gate" style={{ fontSize }}>{entry.gate ?? "—"}</td>
                    <td style={{ fontSize, textDecoration: entry.scratched ? "line-through" : "none", color: entry.scratched ? "#94a3b8" : "inherit", paddingTop: paddingV, paddingBottom: paddingV }}>
                      {entry.horse}
                    </td>
                    <td style={{ fontSize, textDecoration: entry.scratched ? "line-through" : "none", color: entry.scratched ? "#94a3b8" : entry.driver === "Not Declared" ? "#94a3b8" : "inherit", fontStyle: !entry.scratched && entry.driver === "Not Declared" ? "italic" : "normal", paddingTop: paddingV, paddingBottom: paddingV }}>
                      {entry.scratched ? "SCRATCHED" : entry.driver}
                    </td>
                    <td style={{ fontSize }}></td>
                  </tr>
                ))}
              </tbody>
            </table>

          </div>
        );
      })}
    </div>
  );
}
