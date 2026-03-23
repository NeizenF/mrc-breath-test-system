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
};

type TestRow = {
  id: string;
  entry_id: string;
  tested: boolean;
  result: "negative" | "positive" | null;
};

type DeclarationDriverRow = {
  key: string;
  driver_name: string;
  result: "negative" | "positive" | null;
};

export default function MeetingDeclarationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meetingId = params.id;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [rows, setRows] = useState<DeclarationDriverRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        router.replace("/login");
        return;
      }

      await loadDeclarationData();
    })();
  }, [meetingId, router]);

  async function loadDeclarationData() {
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

    const driverIds = [
      ...new Set(entries.map((e) => e.driver_id).filter(Boolean)),
    ] as string[];
    const entryIds = entries.map((e) => e.id);

    let drivers: Driver[] = [];
    if (driverIds.length > 0) {
      const { data: driversData, error: driversError } = await supabase
        .from("drivers")
        .select("id,full_name")
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
        .select("id,entry_id,tested,result")
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
    const grouped = new Map<string, DeclarationDriverRow>();

    for (const entry of entries) {
      const linkedDriver = entry.driver_id ? driverMap.get(entry.driver_id) : null;

      const driverName =
        entry.driver_name_raw || linkedDriver?.full_name || "NOT DECLARED";

      const key = entry.driver_id
        ? `driver:${entry.driver_id}`
        : `name:${driverName}`;

      const test = testMap.get(entry.id);
      const result = test?.result || null;
      const existing = grouped.get(key);

      if (!existing) {
        grouped.set(key, {
          key,
          driver_name: driverName,
          result,
        });
      } else {
        if (result === "positive") {
          existing.result = "positive";
        } else if (result === "negative" && existing.result !== "positive") {
          existing.result = "negative";
        }
      }
    }

    const finalRows = Array.from(grouped.values()).sort((a, b) =>
      a.driver_name.localeCompare(b.driver_name)
    );

    setMeeting(meetingData as Meeting);
    setRows(finalRows);
    setLoading(false);
  }

  const printableDate = useMemo(() => {
    if (!meeting?.meeting_date) return "—";
    return formatDateLong(meeting.meeting_date);
  }, [meeting]);

  const positiveDrivers = useMemo(() => {
    return rows.filter((row) => row.result === "positive");
  }, [rows]);

  const pendingDrivers = useMemo(() => {
    return rows.filter(
      (row) => row.result === null && row.driver_name !== "NOT DECLARED"
    );
  }, [rows]);

  const meetingTitle = useMemo(() => {
    return meeting?.title?.trim() || "Unnamed Meeting";
  }, [meeting]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white p-6 text-black">
        <p>Loading declaration...</p>
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
            size: A4;
            margin: 22mm;
          }
        }
      `}</style>

      <div className="no-print border-b px-6 py-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-lg font-semibold">Declaration letter</h1>
            <p className="text-sm text-gray-600">
              Print this as a separate official declaration.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => router.push(`/meetings/${meetingId}`)}
            >
              Back
            </Button>

            <Button
              variant="outline"
              onClick={() => router.push(`/meetings/${meetingId}/print`)}
            >
              Checklist
            </Button>

            <Button onClick={() => window.print()}>Print / Save PDF</Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[900px] px-8 py-10">
        <div className="mb-10 flex items-start gap-4 border-b-2 border-slate-300 pb-6">
          <img
            src="/mrc-logo.jpg"
            alt="MRC Logo"
            className="h-16 w-16 object-contain"
          />

          <div className="flex-1">
            <div className="text-[20px] font-bold uppercase tracking-wide text-slate-800">
              Malta Racing Club
            </div>
            <div className="mt-1 text-[15px] font-semibold text-slate-700">
              Official Breathalyzer Declaration
            </div>
          </div>
        </div>

        <div className="mb-8 space-y-2 text-[14px] leading-relaxed">
          <div>
            <span className="font-semibold">Meeting:</span> {meetingTitle}
          </div>
          <div>
            <span className="font-semibold">Date:</span> {printableDate}
          </div>
        </div>

        <div className="space-y-5 text-[15px] leading-8 text-slate-900">
          <p>
            I hereby declare that breathalyzer testing was carried out in relation
            to the above-mentioned meeting of the Malta Racing Club.
          </p>

          {pendingDrivers.length > 0 ? (
            <>
              <p>
                At the time of issuing this declaration, the testing record is
                <strong> not yet complete</strong>, as one or more drivers remain
                without a recorded final result.
              </p>

              <p>
                Accordingly, no final declaration is being made at this stage as to
                whether all drivers returned negative results.
              </p>
            </>
          ) : positiveDrivers.length === 0 ? (
            <p>
              Following the administration of the said tests, <strong>no drivers
              returned a positive result</strong>.
            </p>
          ) : positiveDrivers.length === 1 ? (
            <p>
              Following the administration of the said tests, the following driver
              returned a <strong>positive result</strong>:{" "}
              <strong>{positiveDrivers[0].driver_name}</strong>.
            </p>
          ) : (
            <div className="space-y-3">
              <p>
                Following the administration of the said tests, the following
                drivers returned <strong>positive results</strong>:
              </p>

              <ul className="list-disc pl-8">
                {positiveDrivers.map((driver) => (
                  <li key={driver.key}>{driver.driver_name}</li>
                ))}
              </ul>
            </div>
          )}

          <p>
            This declaration is being issued for official record purposes.
          </p>
        </div>

        <div className="mt-16">
          <img
            src="/signature.png"
            alt="Signature"
            className="mb-2 h-20 object-contain"
          />

          <div className="w-[260px] border-t border-slate-400 pt-2 text-[14px]">
            Authorized Signature
          </div>
        </div>
      </div>
    </div>
  );
}