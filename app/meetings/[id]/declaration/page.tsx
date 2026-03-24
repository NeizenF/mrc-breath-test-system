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

  // Editable fields
  const [editMode, setEditMode] = useState(true);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editSignatory, setEditSignatory] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPositives, setEditPositives] = useState<string[]>([]);
  const [totalTested, setTotalTested] = useState(0);

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
      const m = meetingData as Meeting;
      setMeeting(m);
      setRows([]);
      setEditTitle(m.title || "");
      setEditDate(m.meeting_date || "");
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
    const driverIds = [
      ...new Set(allEntries.map((e) => e.driver_id).filter(Boolean)),
    ] as string[];
    const entryIds = allEntries.map((e) => e.id);

    let drivers: Driver[] = [];
    if (driverIds.length > 0) {
      const { data: driversData, error: driversError } = await supabase
        .from("drivers")
        .select("id,full_name")
        .in("id", driverIds);

      if (driversError) {
        toast.error(driversError.message);
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
        toast.error(testsError.message);
        setLoading(false);
        return;
      }
      tests = (testsData as TestRow[]) || [];
    }

    const driverMap = new Map(drivers.map((d) => [d.id, d]));
    const testMap = new Map(tests.map((t) => [t.entry_id, t]));
    const grouped = new Map<string, DeclarationDriverRow>();

    for (const entry of allEntries) {
      if (entry.scratched && !testMap.get(entry.id)?.tested) continue;

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
        grouped.set(key, { key, driver_name: driverName, result });
      } else {
        if (result === "positive") existing.result = "positive";
        else if (result === "negative" && existing.result !== "positive") existing.result = "negative";
      }
    }

    const finalRows = Array.from(grouped.values()).sort((a, b) =>
      a.driver_name.localeCompare(b.driver_name)
    );

    const testedCount = tests.filter((t) => t.tested).length;
    const positiveNames = finalRows
      .filter((r) => r.result === "positive")
      .map((r) => r.driver_name);

    const m = meetingData as Meeting;
    setMeeting(m);
    setRows(finalRows);
    setEditTitle(m.title || "");
    setEditDate(m.meeting_date || "");
    setTotalTested(testedCount);
    setEditPositives(positiveNames);
    setLoading(false);
  }

  function renderBold(text: string) {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i}>{part}</strong> : part
    );
  }

  function resetEdits() {
    setEditTitle(meeting?.title || "");
    setEditDate(meeting?.meeting_date || "");
    setEditSignatory("");
    setEditNotes("");
    setEditPositives(
      rows.filter((r) => r.result === "positive").map((r) => r.driver_name)
    );
  }

  const printableDate = useMemo(() => {
    if (!editDate) return "—";
    return formatDateLong(editDate);
  }, [editDate]);

  const meetingTitle = editTitle.trim() || "Unnamed Meeting";

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
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { size: A4; margin: 22mm; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print border-b px-6 py-4">
        <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-lg font-semibold">Declaration Letter</h1>
            <p className="text-sm text-gray-600">Edit fields below, then print or save as PDF.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => router.push(`/meetings/${meetingId}`)}>Back</Button>
            <Button variant="outline" onClick={() => router.push(`/meetings/${meetingId}/print`)}>Checklist</Button>
            <Button variant="outline" onClick={() => setEditMode((p) => !p)}>
              {editMode ? "Preview" : "Edit"}
            </Button>
            <Button variant="outline" onClick={resetEdits}>Reset</Button>
            <Button onClick={() => window.print()}>Print / Save PDF</Button>
          </div>
        </div>

        {editMode && (
          <div className="grid gap-4 rounded-lg border bg-slate-50 p-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Meeting title</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Meeting title" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Meeting date</label>
              <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Total drivers tested</label>
              <Input
                type="number"
                value={totalTested}
                onChange={(e) => setTotalTested(Number(e.target.value))}
                placeholder="e.g. 12"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Authorized signatory name</label>
              <Input value={editSignatory} onChange={(e) => setEditSignatory(e.target.value)} placeholder="e.g. John Doe" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">
                Positive driver(s) — one per line
              </label>
              <textarea
                value={editPositives.join("\n")}
                onChange={(e) =>
                  setEditPositives(
                    e.target.value === "" ? [] : e.target.value.split("\n")
                  )
                }
                placeholder="Driver name&#10;Another driver"
                rows={Math.max(2, editPositives.length + 1)}
                className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              <p className="text-xs text-gray-400">
                Auto-filled from test results. Edit freely — these are only for the printout.
              </p>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">Additional notes (optional)</label>
              <p className="text-xs text-gray-400">Wrap words in <code className="bg-gray-100 px-1 rounded">**double asterisks**</code> to make them <strong>bold</strong> in the letter.</p>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Any additional information to include..."
                rows={3}
                className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
          </div>
        )}
      </div>

      {/* Printable letter */}
      <div className="mx-auto max-w-[900px] px-8 py-10">
        <div className="mb-10 flex items-start gap-4 border-b-2 border-slate-300 pb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mrc-logo.jpg" alt="MRC Logo" className="h-16 w-16 object-contain" />
          <div className="flex-1">
            <div className="text-[20px] font-bold uppercase tracking-wide text-slate-800">Malta Racing Club</div>
            <div className="mt-1 text-[15px] font-semibold text-slate-700">Official Breathalyzer Declaration</div>
          </div>
        </div>

        <div className="mb-8 space-y-2 text-[14px] leading-relaxed">
          <div><span className="font-semibold">Meeting:</span> {meetingTitle}</div>
          <div><span className="font-semibold">Date:</span> {printableDate}</div>
          {totalTested > 0 && (
            <div><span className="font-semibold">Total drivers tested:</span> {totalTested}</div>
          )}
        </div>

        <div className="space-y-5 text-[15px] leading-8 text-slate-900">
          <p>
            I hereby declare that breathalyzer testing was carried out in relation
            to the above-mentioned meeting of the Malta Racing Club.
          </p>

          {editPositives.filter((n) => n.trim()).length === 0 ? (
            <p>
              Following the administration of the said tests,{" "}
              <strong>no drivers returned a positive result</strong>.
            </p>
          ) : editPositives.filter((n) => n.trim()).length === 1 ? (
            <p>
              Following the administration of the said tests, the following driver
              returned a <strong>positive result</strong>:{" "}
              <strong>{editPositives[0].trim()}</strong>.
            </p>
          ) : (
            <div className="space-y-3">
              <p>
                Following the administration of the said tests, the following
                drivers returned <strong>positive results</strong>:
              </p>
              <ul className="list-disc pl-8">
                {editPositives.filter((n) => n.trim()).map((name, i) => (
                  <li key={i}>{name.trim()}</li>
                ))}
              </ul>
            </div>
          )}

          {editNotes.trim() && (
            <p>{renderBold(editNotes.trim())}</p>
          )}

          <p>This declaration is being issued for official record purposes.</p>
        </div>

        <div className="mt-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/signature.png" alt="Signature" className="mb-2 h-20 object-contain" />
          <div className="w-[260px] border-t border-slate-400 pt-2 text-[14px]">
            {editSignatory.trim() || "Authorized Signature"}
          </div>
        </div>
      </div>
    </div>
  );
}
