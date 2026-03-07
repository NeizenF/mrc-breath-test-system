"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
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

type EditablePrintRow = {
  key: string;
  driver_name: string;
  id_card: string;
  phone: string;
  fully_tested: boolean;
};

export default function MeetingPrintPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meetingId = params.id;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [rows, setRows] = useState<PrintDriverRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [editMode, setEditMode] = useState(true);
  const [editableTitle, setEditableTitle] = useState("");
  const [editableDate, setEditableDate] = useState("");
  const [editableRows, setEditableRows] = useState<EditablePrintRow[]>([]);
  const [notes, setNotes] = useState("");

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
      const loadedMeeting = meetingData as Meeting;
      setMeeting(loadedMeeting);
      setRows([]);
      setEditableTitle(loadedMeeting.title || "");
      setEditableDate(loadedMeeting.meeting_date || "");
      setEditableRows([]);
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
        entry.driver_name_raw || linkedDriver?.full_name || "NOT DECLARED";

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

    const loadedMeeting = meetingData as Meeting;

    setMeeting(loadedMeeting);
    setRows(finalRows);
    setEditableTitle(loadedMeeting.title || "");
    setEditableDate(loadedMeeting.meeting_date || "");
    setEditableRows(
      finalRows.map((row) => ({
        key: row.key,
        driver_name: row.driver_name,
        id_card: row.id_card || "",
        phone: row.phone || "",
        fully_tested: row.fully_tested,
      }))
    );
    setLoading(false);
  }

  function updateEditableRow(
    key: string,
    field: keyof EditablePrintRow,
    value: string | boolean
  ) {
    setEditableRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, [field]: value } : row))
    );
  }

  function resetEdits() {
    setEditableTitle(meeting?.title || "");
    setEditableDate(meeting?.meeting_date || "");
    setEditableRows(
      rows.map((row) => ({
        key: row.key,
        driver_name: row.driver_name,
        id_card: row.id_card || "",
        phone: row.phone || "",
        fully_tested: row.fully_tested,
      }))
    );
    setNotes("");
  }

  const missingTestsCount = useMemo(() => {
    return editableRows.filter((row) => !row.fully_tested).length;
  }, [editableRows]);

  const printableDate = useMemo(() => {
    if (!editableDate) return "—";
    return formatDateLong(editableDate);
  }, [editableDate]);

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
            size: A4 landscape;
            margin: 8mm;
          }
        }
      `}</style>

      <div className="no-print border-b px-6 py-4">
        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-lg font-semibold">Meeting print page</h1>
            <p className="text-sm text-gray-600">
              Edit anything you need, then print or save as PDF.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => router.push(`/meetings/${meetingId}`)}>
              Back
            </Button>

            <Button variant="outline" onClick={() => setEditMode((prev) => !prev)}>
              {editMode ? "Preview mode" : "Edit mode"}
            </Button>

            <Button variant="outline" onClick={resetEdits}>
              Reset edits
            </Button>

            <Button onClick={() => window.print()}>Print / Save PDF</Button>
          </div>
        </div>

        {editMode && (
          <div className="grid gap-4 rounded-lg border bg-slate-50 p-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Meeting title</label>
              <Input
                value={editableTitle}
                onChange={(e) => setEditableTitle(e.target.value)}
                placeholder="Meeting title"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Meeting date</label>
              <Input
                type="date"
                value={editableDate}
                onChange={(e) => setEditableDate(e.target.value)}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes for the printout"
                className="min-h-[80px] w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-[1200px] p-4">
        <div className="mb-2 border px-3 py-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-[42px] w-[42px] shrink-0 items-start justify-start overflow-hidden">
                <img
                  src="/mrc-logo.jpg"
                  alt="MRC Logo"
                  className="h-[42px] w-[42px] object-contain align-top"
                />
              </div>

              <div className="min-w-0">
                <div className="text-[14px] font-semibold leading-tight">
                  Malta Racing Club Breathalyzer Testing
                </div>

                <div className="mt-1 grid grid-cols-[70px_1fr] gap-x-2 gap-y-0.5 text-[11px] leading-tight">
                  <div className="font-semibold">Meeting</div>
                  <div>{editableTitle || "—"}</div>

                  <div className="font-semibold">Date</div>
                  <div>{printableDate}</div>
                </div>
              </div>
            </div>

            <div className="shrink-0 text-right text-[11px] leading-tight">
              <div className="font-semibold uppercase text-gray-500">Status</div>
              <div className="mt-1 font-semibold">
                {missingTestsCount > 0 ? "⚠ Missing tests" : "✓ All tested"}
              </div>
            </div>
          </div>
        </div>

        {notes.trim() && (
          <div className="mb-2 border p-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-700">
              Notes
            </div>
            <div className="whitespace-pre-wrap text-[12px]">{notes}</div>
          </div>
        )}

        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-[#2f6b57] text-left text-white">
              <th className="border px-2 py-1.5">Driver</th>
              <th className="border px-2 py-1.5">ID Number</th>
              <th className="border px-2 py-1.5">Phone</th>
              <th className="border px-2 py-1.5 text-center">Tested</th>
            </tr>
          </thead>
          <tbody>
            {editableRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="border px-3 py-6 text-center text-gray-500">
                  No drivers found for this meeting.
                </td>
              </tr>
            ) : (
              editableRows.map((row) => (
                <tr key={row.key}>
                  <td className="border px-2 py-1">
                    {editMode ? (
                      <Input
                        value={row.driver_name}
                        onChange={(e) =>
                          updateEditableRow(row.key, "driver_name", e.target.value)
                        }
                        className="h-7 border-0 p-0 text-[12px] shadow-none focus-visible:ring-0"
                      />
                    ) : (
                      row.driver_name
                    )}
                  </td>

                  <td className="border px-2 py-1">
                    {editMode ? (
                      <Input
                        value={row.id_card}
                        onChange={(e) =>
                          updateEditableRow(row.key, "id_card", e.target.value)
                        }
                        className="h-7 border-0 p-0 text-[12px] shadow-none focus-visible:ring-0"
                      />
                    ) : (
                      row.id_card
                    )}
                  </td>

                  <td className="border px-2 py-1">
                    {editMode ? (
                      <Input
                        value={row.phone}
                        onChange={(e) =>
                          updateEditableRow(row.key, "phone", e.target.value)
                        }
                        className="h-7 border-0 p-0 text-[12px] shadow-none focus-visible:ring-0"
                      />
                    ) : (
                      row.phone
                    )}
                  </td>

                  <td className="border px-2 py-1 text-center">
                    {editMode ? (
                      <input
                        type="checkbox"
                        checked={row.fully_tested}
                        onChange={(e) =>
                          updateEditableRow(row.key, "fully_tested", e.target.checked)
                        }
                        className="h-3.5 w-3.5"
                      />
                    ) : (
                      <span className="text-sm font-semibold">
                        {row.fully_tested ? "✓" : ""}
                      </span>
                    )}
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