"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatDateLong } from "@/lib/formatters";
import { normalizeName } from "@/lib/normalizeName";
import { Button } from "@/components/ui/button";

type Meeting = {
  id: string;
  title: string | null;
  meeting_date: string | null;
};

type Race = {
  id: string;
  race_number: number;
};

type Entry = {
  id: string;
  race_id: string;
  scratched: boolean | null;
  driver_id: string | null;
  driver_name_raw: string | null;
  tested?: boolean;
  result?: "negative" | "positive" | null;
};

type Driver = {
  id: string;
  full_name: string;
  id_card: string | null;
  phone: string | null;
};

type SummaryRow = {
  key: string;
  name: string;
  id_card: string | null;
  phone: string | null;
  races: number[];
  tested: boolean;
  result: "negative" | "positive" | null;
};

function getDriverKey(entry: Entry) {
  if (entry.driver_id) return `id:${entry.driver_id}`;
  const raw = normalizeName(entry.driver_name_raw || "");
  if (raw) return `raw:${raw}`;
  return null;
}

export default function MeetingSummaryPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meetingId = params.id;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedAt] = useState(() => new Date());

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace("/");
        return;
      }
      await load();
    })();
  }, [meetingId]);

  async function load() {
    setLoading(true);

    const { data: meetingData, error: meetingError } = await supabase
      .from("meetings")
      .select("id,title,meeting_date")
      .eq("id", meetingId)
      .single();

    if (meetingError || !meetingData) {
      setLoading(false);
      return;
    }

    const { data: racesData } = await supabase
      .from("races")
      .select("id,race_number")
      .eq("meeting_id", meetingId)
      .order("race_number", { ascending: true });

    const races = (racesData as Race[]) || [];
    const raceIds = races.map((r) => r.id);
    const raceNumberById = new Map(races.map((r) => [r.id, r.race_number]));

    let entries: Entry[] = [];

    if (raceIds.length > 0) {
      const { data: entriesData } = await supabase
        .from("entries")
        .select("id,race_id,scratched,driver_id,driver_name_raw")
        .in("race_id", raceIds);

      entries = (entriesData as Entry[]) || [];

      const entryIds = entries.map((e) => e.id);
      if (entryIds.length > 0) {
        const { data: testsData } = await supabase
          .from("tests")
          .select("entry_id,tested,result")
          .eq("meeting_id", meetingId)
          .in("entry_id", entryIds);

        const testMap = new Map((testsData || []).map((t) => [t.entry_id, t]));
        entries = entries.map((e) => {
          const t = testMap.get(e.id);
          return { ...e, tested: !!t?.tested, result: t?.result ?? null };
        });
      }
    }

    const driverIds = [...new Set(entries.map((e) => e.driver_id).filter(Boolean))] as string[];
    const driverMap = new Map<string, Driver>();

    if (driverIds.length > 0) {
      const { data: driversData } = await supabase
        .from("drivers")
        .select("id,full_name,id_card,phone")
        .in("id", driverIds);

      for (const d of (driversData as Driver[]) || []) {
        driverMap.set(d.id, d);
      }
    }

    const grouped = new Map<string, SummaryRow>();

    for (const entry of entries) {
      if (entry.scratched && !entry.tested) continue;

      const key = getDriverKey(entry);
      if (!key) continue;

      const linkedDriver = entry.driver_id ? driverMap.get(entry.driver_id) : null;
      const name =
        linkedDriver?.full_name ||
        (entry.driver_name_raw?.trim() || "Unknown driver");

      const raceNum = raceNumberById.get(entry.race_id);
      const entryResult = (entry.result as "negative" | "positive" | null) ?? null;

      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          key,
          name,
          id_card: linkedDriver?.id_card ?? null,
          phone: linkedDriver?.phone ?? null,
          races: typeof raceNum === "number" ? [raceNum] : [],
          tested: !!entry.tested,
          result: entryResult,
        });
      } else {
        if (entry.tested) existing.tested = true;
        if (entryResult === "positive") existing.result = "positive";
        else if (entryResult === "negative" && existing.result !== "positive") existing.result = "negative";
        if (typeof raceNum === "number" && !existing.races.includes(raceNum)) existing.races.push(raceNum);
        if ((existing.name === "Unknown driver" || !existing.name) && name !== "Unknown driver") existing.name = name;
        if (!existing.id_card && linkedDriver?.id_card) existing.id_card = linkedDriver.id_card;
        if (!existing.phone && linkedDriver?.phone) existing.phone = linkedDriver.phone;
      }
    }

    const finalRows = Array.from(grouped.values())
      .map((r) => ({ ...r, races: [...r.races].sort((a, b) => a - b) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    setMeeting(meetingData as Meeting);
    setRows(finalRows);
    setLoading(false);
  }

  const stats = useMemo(() => {
    const total = rows.length;
    const tested = rows.filter((r) => r.tested).length;
    const positives = rows.filter((r) => r.result === "positive").length;
    const negatives = rows.filter((r) => r.result === "negative").length;
    const pending = rows.filter((r) => !r.tested).length;
    const completion = total > 0 ? Math.round((tested / total) * 100) : 0;
    return { total, tested, positives, negatives, pending, completion };
  }, [rows]);

  const meetingLabel = meeting?.title?.trim() || formatDateLong(meeting?.meeting_date ?? null) || "Meeting";
  const meetingDate = formatDateLong(meeting?.meeting_date ?? null);

  if (loading) {
    return (
      <div className="min-h-screen bg-white p-8 text-black">
        <p className="text-sm text-gray-500">Loading summary...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page {
            size: A4 portrait;
            margin: 14mm 12mm 18mm 12mm;
          }
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
        }
      `}</style>

      {/* Screen toolbar */}
      <div className="no-print border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Meeting Summary Report</h1>
            <p className="text-sm text-gray-500">Read-only post-meeting report. Print or save as PDF.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => router.back()}>Back</Button>
            <Button onClick={() => window.print()}>Print / Save PDF</Button>
          </div>
        </div>
      </div>

      {/* Report body */}
      <div className="mx-auto max-w-[800px] p-6 print:p-0">

        {/* Header block */}
        <div className="mb-6 flex items-start justify-between gap-4 rounded-xl border-2 border-slate-300 p-5">
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mrc-logo.jpg" alt="MRC Logo" className="h-14 w-14 object-contain" />
            <div>
              <div className="text-[17px] font-bold uppercase tracking-wide text-slate-800">Malta Racing Club</div>
              <div className="text-[14px] font-semibold text-slate-600">Breathalyzer Testing — Meeting Summary</div>
              <div className="mt-3 grid grid-cols-[90px_1fr] gap-x-3 gap-y-1 text-[12px]">
                <span className="font-semibold text-slate-600">Meeting</span>
                <span>{meetingLabel}</span>
                <span className="font-semibold text-slate-600">Date</span>
                <span>{meetingDate || "—"}</span>
                <span className="font-semibold text-slate-600">Generated</span>
                <span>
                  {generatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })},{" "}
                  {generatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          </div>

          {/* Stats box */}
          <div className="min-w-[160px] rounded-lg border border-slate-200 bg-slate-50 p-4 text-right text-[12px]">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Summary</div>
            <div className="space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Total drivers</span>
                <span className="font-semibold">{stats.total}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Tested</span>
                <span className="font-semibold">{stats.tested}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Pending</span>
                <span className="font-semibold">{stats.pending}</span>
              </div>
              <div className="mt-2 border-t border-slate-200 pt-2 flex justify-between gap-4">
                <span className="text-green-600">Negative</span>
                <span className="font-semibold text-green-700">{stats.negatives}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-red-600">Positive</span>
                <span className="font-semibold text-red-700">{stats.positives}</span>
              </div>
              <div className="mt-2 border-t border-slate-200 pt-2 flex justify-between gap-4">
                <span className="text-slate-500">Completion</span>
                <span className="font-semibold">{stats.completion}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Results table */}
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-[#1f4d3d] text-left text-white">
              <th className="border border-slate-400 px-3 py-2">#</th>
              <th className="border border-slate-400 px-3 py-2">Driver Name</th>
              <th className="border border-slate-400 px-3 py-2">ID Number</th>
              <th className="border border-slate-400 px-3 py-2">Phone</th>
              <th className="border border-slate-400 px-3 py-2">Races</th>
              <th className="border border-slate-400 px-3 py-2 text-center">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="border border-slate-300 px-3 py-6 text-center text-slate-400">
                  No driver data found for this meeting.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => {
                const resultBg =
                  row.result === "positive"
                    ? "bg-red-50"
                    : row.result === "negative"
                    ? "bg-green-50"
                    : !row.tested
                    ? "bg-amber-50"
                    : i % 2 === 0
                    ? "bg-white"
                    : "bg-slate-50";

                const resultLabel =
                  row.result === "positive"
                    ? "Positive"
                    : row.result === "negative"
                    ? "Negative"
                    : row.tested
                    ? "Tested"
                    : "Pending";

                const resultColor =
                  row.result === "positive"
                    ? "text-red-700 font-bold"
                    : row.result === "negative"
                    ? "text-green-700 font-semibold"
                    : row.tested
                    ? "text-blue-600"
                    : "text-amber-600";

                return (
                  <tr key={row.key} className={resultBg}>
                    <td className="border border-slate-300 px-3 py-2 text-center text-slate-400">{i + 1}</td>
                    <td className="border border-slate-300 px-3 py-2 font-medium">{row.name}</td>
                    <td className="border border-slate-300 px-3 py-2 text-slate-600">{row.id_card || "—"}</td>
                    <td className="border border-slate-300 px-3 py-2 text-slate-600">{row.phone || "—"}</td>
                    <td className="border border-slate-300 px-3 py-2 text-slate-600">
                      {row.races.length > 0 ? row.races.join(", ") : "—"}
                    </td>
                    <td className={`border border-slate-300 px-3 py-2 text-center ${resultColor}`}>
                      {resultLabel}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Footer */}
        <div className="mt-6 border-t border-slate-300 pt-4 text-[10px] text-slate-400 flex justify-between">
          <span>MRC Breath Test System</span>
          <span>This document is auto-generated and for internal use only.</span>
        </div>
      </div>
    </div>
  );
}
