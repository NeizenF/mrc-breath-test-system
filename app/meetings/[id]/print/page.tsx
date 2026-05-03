"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
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
  result: "negative" | "positive" | null;
  alcohol_level: string | null;
};

type PrintDriverRow = {
  key: string;
  driver_name: string;
  id_card: string | null;
  phone: string | null;
  has_result: boolean;
  result: "negative" | "positive" | null;
  alcohol_level: string | null;
};

type EditablePrintRow = {
  key: string;
  driver_name: string;
  id_card: string;
  phone: string;
  result: "negative" | "positive" | null;
  alcohol_level: string;
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
  }, [meetingId, router]);

  async function loadPrintData() {
    setLoading(true);

    const { data: meetingData, error: meetingError } = await supabase
      .from("meetings")
      .select("id,title,meeting_date")
      .eq("id", meetingId)
      .single();

    if (meetingError) {
      toast.error(meetingError.message);
      setLoading(false);
      return;
    }

    const { data: racesData, error: racesError } = await supabase
      .from("races")
      .select("id,race_number")
      .eq("meeting_id", meetingId);

    if (racesError) {
      toast.error(racesError.message);
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
      toast.error(entriesError.message);
      setLoading(false);
      return;
    }

    const allEntries = (entriesData as EntryRow[]) || [];
    const allEntryIds = allEntries.map((e) => e.id);

    const allDriverIds = [
      ...new Set(allEntries.map((e) => e.driver_id).filter(Boolean)),
    ] as string[];

    let drivers: Driver[] = [];
    if (allDriverIds.length > 0) {
      const { data: driversData, error: driversError } = await supabase
        .from("drivers")
        .select("id,full_name,id_card,phone")
        .in("id", allDriverIds);

      if (driversError) {
        toast.error(driversError.message);
        setLoading(false);
        return;
      }

      drivers = (driversData as Driver[]) || [];
    }

    let tests: TestRow[] = [];
    if (allEntryIds.length > 0) {
      const { data: testsData, error: testsError } = await supabase
        .from("tests")
        .select("id,entry_id,tested,result,alcohol_level")
        .eq("meeting_id", meetingId)
        .in("entry_id", allEntryIds);

      if (testsError) {
        toast.error(testsError.message);
        setLoading(false);
        return;
      }

      tests = (testsData as TestRow[]) || [];
    }

    const testMap = new Map(tests.map((t) => [t.entry_id, t]));

    // Exclude entries with no driver assigned (blank replacement slots)
    // Include non-scratched entries + scratched entries that have a test result
    const entries = allEntries.filter(
      (entry) =>
        (entry.driver_id || entry.driver_name_raw) &&
        (!entry.scratched || testMap.has(entry.id))
    );

    const driverMap = new Map(drivers.map((d) => [d.id, d]));
    const grouped = new Map<string, PrintDriverRow>();

    for (const entry of entries) {
      const linkedDriver = entry.driver_id ? driverMap.get(entry.driver_id) : null;

      const driverName =
        entry.driver_name_raw || linkedDriver?.full_name || "NOT DECLARED";

      const key = entry.driver_id
        ? `driver:${entry.driver_id}`
        : `name:${driverName}`;

      const existing = grouped.get(key);
      const test = testMap.get(entry.id);
      const result = test?.result || null;

      if (!existing) {
        grouped.set(key, {
          key,
          driver_name: driverName,
          id_card: linkedDriver?.id_card || null,
          phone: linkedDriver?.phone || null,
          has_result: result !== null,
          result,
          alcohol_level: test?.alcohol_level || null,
        });
      } else {
        if (result === "positive") {
          existing.result = "positive";
          existing.has_result = true;
          if (test?.alcohol_level) existing.alcohol_level = test.alcohol_level;
        } else if (result === "negative" && existing.result !== "positive") {
          existing.result = "negative";
          existing.has_result = true;
        }
      }
    }

    const finalRows = Array.from(grouped.values()).sort((a, b) =>
      a.driver_name.localeCompare(b.driver_name)
    );

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
        result: row.result,
        alcohol_level: row.alcohol_level || "",
      }))
    );
    setLoading(false);
  }

  function updateEditableRow(
    key: string,
    field: keyof EditablePrintRow,
    value: string | null
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
        result: row.result,
        alcohol_level: row.alcohol_level || "",
      }))
    );
    setNotes("");
  }

  const pendingCount = useMemo(() => {
    return editableRows.filter((row) => row.result === null).length;
  }, [editableRows]);

  const positiveCount = useMemo(() => {
    return editableRows.filter((row) => row.result === "positive").length;
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
            margin: 12mm 10mm 18mm 10mm;
          }

          thead {
            display: table-header-group;
          }

          tr {
            page-break-inside: avoid;
          }

        }
      `}</style>

      <div className="no-print border-b px-6 py-4">
        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-lg font-semibold">Breath test checklist</h1>
            <p className="text-sm text-gray-600">
              Edit anything you need, then print or save as PDF.
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
              onClick={() => router.push(`/meetings/${meetingId}/declaration`)}
            >
              Declaration Letter
            </Button>

            <Button
              variant="outline"
              onClick={() => setEditMode((prev) => !prev)}
            >
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
        <div className="mb-4 rounded-xl border-2 border-slate-300 px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <img
                src="/mrc-logo.jpg"
                alt="MRC Logo"
                className="h-14 w-14 object-contain"
              />

              <div>
                <div className="text-[18px] font-bold uppercase tracking-wide text-slate-800">
                  Malta Racing Club
                </div>
                <div className="text-[15px] font-semibold text-slate-700">
                  Breathalyzer Testing Checklist
                </div>

                <div className="mt-3 grid grid-cols-[85px_1fr] gap-x-3 gap-y-1 text-[12px]">
                  <div className="font-semibold text-slate-700">Meeting</div>
                  <div>{editableTitle || "—"}</div>

                  <div className="font-semibold text-slate-700">Date</div>
                  <div>{printableDate}</div>
                </div>
              </div>
            </div>

            <div className="min-w-[220px] rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-right">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Summary
              </div>
              <div className="mt-2 text-[13px] font-semibold">
                {positiveCount > 0
                  ? `${positiveCount} positive`
                  : pendingCount > 0
                  ? `${pendingCount} pending`
                  : "All results entered"}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Pending: {pendingCount} • Positive: {positiveCount}
              </div>
            </div>
          </div>
        </div>

        {notes.trim() && (
          <div className="mb-4 rounded-lg border border-slate-300 p-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              Notes
            </div>
            <div className="whitespace-pre-wrap text-[12px]">{notes}</div>
          </div>
        )}

        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-[#1f4d3d] text-left text-white">
              <th className="border border-slate-400 px-3 py-2">Driver Name</th>
              <th className="border border-slate-400 px-3 py-2">ID Number</th>
              <th className="border border-slate-400 px-3 py-2">Phone Number</th>
              <th className="border border-slate-400 px-3 py-2 text-center">
                Result
              </th>
            </tr>
          </thead>
          <tbody>
            {editableRows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="border border-slate-300 px-3 py-6 text-center text-slate-500"
                >
                  No drivers found for this meeting.
                </td>
              </tr>
            ) : (
              editableRows.map((row, index) => {
                const rowBg =
                  row.result === "positive"
                    ? "bg-red-50"
                    : row.result === "negative"
                    ? "bg-green-50"
                    : row.result === null
                    ? "bg-yellow-50"
                    : index % 2 === 0
                    ? "bg-white"
                    : "bg-slate-50";

                return (
                  <tr key={row.key} className={rowBg}>
                    <td className="border border-slate-300 px-3 py-2">
                      {editMode ? (
                        <Input
                          value={row.driver_name}
                          onChange={(e) =>
                            updateEditableRow(row.key, "driver_name", e.target.value)
                          }
                          className="h-7 border-0 bg-transparent p-0 text-[12px] shadow-none focus-visible:ring-0"
                        />
                      ) : (
                        row.driver_name
                      )}
                    </td>

                    <td className="border border-slate-300 px-3 py-2">
                      {editMode ? (
                        <Input
                          value={row.id_card}
                          onChange={(e) =>
                            updateEditableRow(row.key, "id_card", e.target.value)
                          }
                          className="h-7 border-0 bg-transparent p-0 text-[12px] shadow-none focus-visible:ring-0"
                        />
                      ) : (
                        row.id_card || "—"
                      )}
                    </td>

                    <td className="border border-slate-300 px-3 py-2">
                      {editMode ? (
                        <Input
                          value={row.phone}
                          onChange={(e) =>
                            updateEditableRow(row.key, "phone", e.target.value)
                          }
                          className="h-7 border-0 bg-transparent p-0 text-[12px] shadow-none focus-visible:ring-0"
                        />
                      ) : (
                        row.phone || "—"
                      )}
                    </td>

                    <td
                      className={`border border-slate-300 px-3 py-2 text-center font-semibold ${
                        row.result === "negative"
                          ? "bg-green-100 text-green-800"
                          : row.result === "positive"
                          ? "bg-red-100 text-red-800"
                          : "text-slate-400"
                      }`}
                    >
                      {editMode ? (
                        <div className="space-y-1">
                          <select
                            value={row.result || ""}
                            onChange={(e) =>
                              updateEditableRow(
                                row.key,
                                "result",
                                e.target.value === ""
                                  ? null
                                  : (e.target.value as "negative" | "positive")
                              )
                            }
                            className="rounded border px-2 py-1 text-[12px]"
                          >
                            <option value="">Pending</option>
                            <option value="negative">Negative</option>
                            <option value="positive">Positive</option>
                          </select>
                          {row.result === "positive" && (
                            <Input
                              value={row.alcohol_level}
                              onChange={(e) => updateEditableRow(row.key, "alcohol_level", e.target.value)}
                              placeholder="Reading"
                              className="h-6 border-slate-300 bg-transparent p-1 text-[11px] shadow-none focus-visible:ring-0"
                            />
                          )}
                        </div>
                      ) : row.result === "negative" ? (
                        "Negative"
                      ) : row.result === "positive" ? (
                        <span>Positive{row.alcohol_level ? ` — ${row.alcohol_level}` : ""}</span>
                      ) : (
                        "Pending"
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>


    </div>
  );
}