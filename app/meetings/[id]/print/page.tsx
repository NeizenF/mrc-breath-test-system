"use client";

import { useEffect, useMemo, useState } from "react";
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
};

type EntryRow = {
  id: string;
  race_id: string;
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
};

type PrintDriverRow = {
  key: string;
  driver_name: string;
  id_card: string | null;
  phone: string | null;
  tested_count: number;
  total_count: number;
  fully_tested: boolean;
};

export default function MeetingPrintPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meetingId = params.id;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [rows, setRows] = useState<PrintDriverRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace("/login");
        return;
      }

      await loadPrintData();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  async function loadPrintData() {
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

    const { data: racesData, error: racesError } = await supabase
      .from("races")
      .select("id,race_number")
      .eq("meeting_id", meetingId);

    if (racesError) {
      alert(racesError.message);
      setLoading(false);
      return;
    }

    const races = (racesData as Race[]) || [];
    const raceIds = races.map((r) => r.id);

    if (raceIds.length === 0) {
      setMeeting(meetingData as Meeting);
      setRows([]);
      setLoading(false);
      return;
    }

    const { data: entriesData, error: entriesError } = await supabase
      .from("entries")
      .select("id,race_id,scratched,driver_id,driver_name_raw")
      .in("race_id", raceIds);

    if (entriesError) {
      alert(entriesError.message);
      setLoading(false);
      return;
    }

    const entries = ((entriesData as EntryRow[]) || []).filter(
      (entry) => !entry.scratched
    );

    const driverIds = [...new Set(entries.map((e) => e.driver_id).filter(Boolean))] as string[];
    const entryIds = entries.map((e) => e.id);

    let drivers: Driver[] = [];
    if (driverIds.length > 0) {
      const { data: driversData, error: driversError } = await supabase
        .from("drivers")
        .select("id,full_name,id_card,phone")
        .in("id", driverIds);

      if (driversError) {
        alert(driversError.message);
        setLoading(false);
        return;
      }

      drivers = (driversData as Driver[]) || [];
    }

    let tests: TestRow[] = [];
    if (entryIds.length > 0) {
      const { data: testsData, error: testsError } = await supabase
        .from("tests")
        .select("id,entry_id,tested")
        .eq("meeting_id", meetingId)
        .in("entry_id", entryIds);

      if (testsError) {
        alert(testsError.message);
        setLoading(false);
        return;
      }

      tests = (testsData as TestRow[]) || [];
    }

    const driverMap = new Map(drivers.map((d) => [d.id, d]));
    const testMap = new Map(tests.map((t) => [t.entry_id, t]));

    const grouped = new Map<string, PrintDriverRow>();

    for (const entry of entries) {
      const linkedDriver = entry.driver_id ? driverMap.get(entry.driver_id) : null;

      const driverName =
        entry.driver_name_raw ||
        linkedDriver?.full_name ||
        "NOT DECLARED";

      const key = entry.driver_id
        ? `driver:${entry.driver_id}`
        : `name:${driverName}`;

      const existing = grouped.get(key);
      const tested = !!testMap.get(entry.id)?.tested;

      if (!existing) {
        grouped.set(key, {
          key,
          driver_name: driverName,
          id_card: linkedDriver?.id_card || null,
          phone: linkedDriver?.phone || null,
          tested_count: tested ? 1 : 0,
          total_count: 1,
          fully_tested: false,
        });
      } else {
        existing.total_count += 1;
        if (tested) existing.tested_count += 1;
      }
    }

    const finalRows = Array.from(grouped.values())
      .map((row) => ({
        ...row,
        fully_tested: row.total_count > 0 && row.tested_count === row.total_count,
      }))
      .sort((a, b) => a.driver_name.localeCompare(b.driver_name));

    setMeeting(meetingData as Meeting);
    setRows(finalRows);
    setLoading(false);
  }

  const missingTestsCount = useMemo(() => {
    return rows.filter((row) => !row.fully_tested).length;
  }, [rows]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white p-6 text-black">
        <p>Loading print page...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }

          body {
            background: white !important;
          }

          @page {
            size: A4 portrait;
            margin: 12mm;
          }
        }
      `}</style>

      <div className="no-print flex items-center justify-between border-b px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold">Meeting print page</h1>
          <p className="text-sm text-gray-600">
            Use Print and save as PDF when ready.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/meetings/${meetingId}`)}>
            Back
          </Button>
          <Button onClick={() => window.print()}>
            Print / Save PDF
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 grid grid-cols-[220px_1fr_220px] gap-0 border">
          <div className="flex min-h-[150px] items-center justify-center border-r p-4">
            <img
              src="/mrc-logo.jpg"
              alt="MRC Logo"
              className="max-h-[120px] max-w-[160px] object-contain"
            />
          </div>

          <div className="min-h-[150px] border-r p-4">
            <h1 className="mb-6 text-4xl font-semibold leading-tight">
              Malta Racing Club Breathalyzer Testing
            </h1>

            <div className="grid grid-cols-[120px_1fr] gap-y-2 text-[28px] leading-none print:text-[16px]">
              <div className="font-medium">Meeting #</div>
              <div>{meeting?.title || "—"}</div>

              <div className="font-medium">Date</div>
              <div>
                {meeting?.meeting_date ? formatDateLong(meeting.meeting_date) : "—"}
              </div>
            </div>
          </div>

          <div className="flex items-start justify-center p-4 pt-8">
            <div className="text-lg font-medium">
              {missingTestsCount > 0 ? "⚠ MISSING TESTS" : "✓ ALL TESTED"}
            </div>
          </div>
        </div>

        <table className="w-full border-collapse text-[15px]">
          <thead>
            <tr className="bg-[#2f6b57] text-left text-white">
              <th className="border px-3 py-2">Driver</th>
              <th className="border px-3 py-2">ID Number</th>
              <th className="border px-3 py-2">Phone</th>
              <th className="border px-3 py-2 text-center">Tested</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="border px-3 py-6 text-center text-gray-500">
                  No drivers found for this meeting.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key}>
                  <td className="border px-3 py-2">{row.driver_name}</td>
                  <td className="border px-3 py-2">{row.id_card || ""}</td>
                  <td className="border px-3 py-2">{row.phone || ""}</td>
                  <td className="border px-3 py-2 text-center text-lg font-semibold">
                    {row.fully_tested ? "✓" : ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}