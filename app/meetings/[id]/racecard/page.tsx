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

const MIN_ROWS = 16;

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
          .eq("meeting_id", meetingId)
          .order("race_number", { ascending: true }),
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
    <div className="bg-white text-black">
      <style jsx global>{`
        * { box-sizing: border-box; }

        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; margin: 0; padding: 0; }
          @page { size: A4 portrait; margin: 10mm 12mm; }

          .race-page {
            page-break-after: always;
            break-after: page;
          }
          .race-page:last-child {
            page-break-after: avoid;
            break-after: avoid;
          }
        }

        .race-page {
          width: 100%;
          height: 277mm;
          display: flex;
          flex-direction: column;
          padding: 6mm;
        }

        .race-table-wrap {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .race-table {
          width: 100%;
          height: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 11px;
        }

        .race-table thead tr {
          background: #1e293b;
          color: white;
        }

        .race-table thead th {
          border: 1px solid #475569;
          padding: 5px 8px;
          text-align: left;
          font-weight: 600;
        }

        .race-table tbody {
          height: 100%;
        }

        .race-table tbody tr {
          height: calc(100% / ${MIN_ROWS});
        }

        .race-table tbody td {
          border: 1px solid #cbd5e1;
          padding: 3px 8px;
          vertical-align: middle;
        }

        .race-table .col-gate { width: 52px; text-align: center; font-weight: 600; }
        .race-table .col-horse { width: 35%; }
        .race-table .col-driver { width: 35%; }
        .race-table .col-remarks { width: 18%; }

        .row-even { background: #ffffff; }
        .row-odd  { background: #f8fafc; }
        .row-scratched { background: #f1f5f9; opacity: 0.6; }

        .scratched-text { text-decoration: line-through; color: #94a3b8; }
        .not-declared { font-style: italic; color: #94a3b8; }
      `}</style>

      {/* Toolbar - screen only */}
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
      {races.map((race, idx) => {
        const entryCount = race.entries.length;
        const blankCount = Math.max(0, MIN_ROWS - entryCount);

        return (
          <div key={race.id} className="race-page">

            {/* Page header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #1e293b", paddingBottom: "6px", marginBottom: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mrc-logo.jpg" alt="MRC" style={{ height: "44px", width: "44px", objectFit: "contain" }} />
                <div>
                  <div style={{ fontSize: "15px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "#1e293b" }}>Malta Racing Club</div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>{meetingTitle} · {meetingDate}</div>
                </div>
              </div>
              <div style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 500 }}>{idx + 1}/{totalPages}</div>
            </div>

            {/* Race info band */}
            <div style={{ display: "flex", border: "2px solid #1e293b", borderRadius: "6px", overflow: "hidden", marginBottom: "6px" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#1e293b", color: "white", padding: "8px 16px", minWidth: "70px" }}>
                <div style={{ fontSize: "9px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.7 }}>Race</div>
                <div style={{ fontSize: "26px", fontWeight: 900, lineHeight: 1 }}>{race.race_number}</div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 20px", padding: "8px 14px", fontSize: "11px", alignContent: "center" }}>
                {race.race_time && <div><strong style={{ color: "#475569" }}>Time:</strong> {race.race_time}</div>}
                {race.race_distance && <div><strong style={{ color: "#475569" }}>Distance:</strong> {race.race_distance}</div>}
                {race.race_class && <div><strong style={{ color: "#475569" }}>Class:</strong> {race.race_class}</div>}
                {race.qualifiers != null && <div><strong style={{ color: "#475569" }}>Qualifiers:</strong> {race.qualifiers}{race.qualifiers_next_stage ? ` → ${race.qualifiers_next_stage}` : ""}</div>}
                {race.race_name && <div style={{ width: "100%" }}><strong style={{ color: "#475569" }}>Name:</strong> {race.race_name}</div>}
              </div>
            </div>

            {/* Table */}
            <div className="race-table-wrap">
              <table className="race-table">
                <thead>
                  <tr>
                    <th className="col-gate">Gate</th>
                    <th className="col-horse">Horse</th>
                    <th className="col-driver">Driver</th>
                    <th className="col-remarks">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {race.entries.map((entry, i) => (
                    <tr key={i} className={entry.scratched ? "row-scratched" : i % 2 === 0 ? "row-even" : "row-odd"}>
                      <td className="col-gate">{entry.gate ?? "—"}</td>
                      <td className={`col-horse${entry.scratched ? " scratched-text" : ""}`}>{entry.horse}</td>
                      <td className={`col-driver${entry.scratched ? " scratched-text" : entry.driver === "Not Declared" ? " not-declared" : ""}`}>
                        {entry.scratched ? "SCRATCHED" : entry.driver}
                      </td>
                      <td className="col-remarks"></td>
                    </tr>
                  ))}
                  {Array.from({ length: blankCount }).map((_, i) => (
                    <tr key={`blank-${i}`} className={(entryCount + i) % 2 === 0 ? "row-even" : "row-odd"}>
                      <td className="col-gate"></td>
                      <td className="col-horse"></td>
                      <td className="col-driver"></td>
                      <td className="col-remarks"></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        );
      })}
    </div>
  );
}
