"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shuffle } from "lucide-react";

type Meeting = {
  id: string;
  title: string | null;
  meeting_date: string | null;
};

type Candidate = {
  entryId: string;
  raceNumber: number;
  gate: number | null;
  driverName: string;
};

type SelectedDriver = Candidate & { picked: boolean };

function formatDate(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function meetingLabel(m: Meeting) {
  return m.title?.trim() || formatDate(m.meeting_date);
}

export default function DrugTestsPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState("");
  const [count, setCount] = useState(3);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const [results, setResults] = useState<SelectedDriver[] | null>(null);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session) { router.replace("/"); return; }

      const admin = await isCurrentUserAdmin();
      if (!mounted) return;
      if (!admin) { router.replace("/dashboard"); return; }

      setCheckingAccess(false);

      const { data } = await supabase
        .from("meetings")
        .select("id,title,meeting_date")
        .eq("is_archived", false)
        .order("meeting_date", { ascending: false });

      if (mounted) setMeetings(data ?? []);
    }

    init();
    return () => { mounted = false; };
  }, [router]);

  // Load candidates whenever meeting changes
  useEffect(() => {
    if (!selectedMeeting) { setCandidates([]); setResults(null); return; }

    let mounted = true;
    setLoadingCandidates(true);
    setResults(null);

    async function loadCandidates() {
      // Get races for this meeting
      const { data: races } = await supabase
        .from("races")
        .select("id,race_number")
        .eq("meeting_id", selectedMeeting)
        .order("race_number", { ascending: true });

      if (!mounted || !races?.length) {
        setCandidates([]);
        setLoadingCandidates(false);
        return;
      }

      const raceIds = races.map((r) => r.id);
      const raceMap = new Map(races.map((r) => [r.id, r.race_number]));

      // Get non-scratched entries with driver names
      const { data: entries } = await supabase
        .from("entries")
        .select("id,race_id,gate,driver_name_raw,driver_id,drivers(full_name)")
        .in("race_id", raceIds)
        .or("scratched.is.null,scratched.eq.false");

      if (!mounted) return;

      const list: Candidate[] = (entries ?? []).map((e) => {
        const driverRow = Array.isArray(e.drivers) ? e.drivers[0] : e.drivers;
        const name = (driverRow as { full_name?: string } | null)?.full_name?.trim()
          || e.driver_name_raw?.trim()
          || "Unknown driver";
        return {
          entryId: e.id,
          raceNumber: raceMap.get(e.race_id) ?? 0,
          gate: e.gate,
          driverName: name,
        };
      });

      // Deduplicate by driver name — one entry per driver is enough for drug test selection
      const seen = new Set<string>();
      const unique = list.filter((c) => {
        const key = c.driverName.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      unique.sort((a, b) => a.raceNumber - b.raceNumber || (a.gate ?? 0) - (b.gate ?? 0));

      setCandidates(unique);
      setLoadingCandidates(false);
    }

    loadCandidates();
    return () => { mounted = false; };
  }, [selectedMeeting]);

  function pickRandom() {
    if (!candidates.length) return;
    const n = Math.min(Math.max(1, count), candidates.length);
    const pool = [...candidates];
    const picked: Candidate[] = [];

    while (picked.length < n) {
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool.splice(idx, 1)[0]);
    }

    const pickedIds = new Set(picked.map((p) => p.entryId));
    const all: SelectedDriver[] = candidates.map((c) => ({ ...c, picked: pickedIds.has(c.entryId) }));
    all.sort((a, b) => (b.picked ? 1 : 0) - (a.picked ? 1 : 0) || a.raceNumber - b.raceNumber);
    setResults(all);
  }

  if (checkingAccess) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const pickedCount = results?.filter((r) => r.picked).length ?? 0;

  return (
    <div className="p-4 md:p-6">
      <div className="mb-2">
        <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Drug Tests" }]} />
      </div>
      <div className="mb-6 mt-4">
        <h1 className="text-xl font-semibold tracking-tight">Drug Test Selection</h1>
        <p className="mt-1 text-sm text-muted-foreground">Randomly select drivers for drug testing from a meeting.</p>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-5 pb-5 space-y-4">
          {/* Meeting selector */}
          <div>
            <label className="block mb-1.5 text-sm font-medium">Meeting</label>
            <select
              value={selectedMeeting}
              onChange={(e) => setSelectedMeeting(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— Select a meeting —</option>
              {meetings.map((m) => (
                <option key={m.id} value={m.id}>{meetingLabel(m)}</option>
              ))}
            </select>
          </div>

          {/* Count input */}
          <div>
            <label className="block mb-1.5 text-sm font-medium">Number of drivers to select</label>
            <Input
              type="number"
              min={1}
              max={candidates.length || 999}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 1)}
              className="w-32"
            />
          </div>

          {/* Candidate count */}
          {selectedMeeting && (
            <p className="text-sm text-muted-foreground">
              {loadingCandidates
                ? "Loading drivers…"
                : candidates.length === 0
                ? "No eligible drivers found for this meeting."
                : `${candidates.length} eligible driver${candidates.length !== 1 ? "s" : ""} in this meeting.`}
            </p>
          )}

          <Button
            onClick={pickRandom}
            disabled={!selectedMeeting || loadingCandidates || candidates.length === 0}
            className="gap-2"
          >
            <Shuffle className="h-4 w-4" />
            Pick randomly
          </Button>
        </CardContent>
      </Card>

      {results && (
        <div>
          <p className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-widest text-xs">
            Selected: {pickedCount} driver{pickedCount !== 1 ? "s" : ""}
          </p>
          <div className="space-y-2">
            {results.map((r) => (
              <div
                key={r.entryId}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors ${
                  r.picked
                    ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40"
                    : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 opacity-40"
                }`}
              >
                <div className="flex items-center gap-4">
                  {r.picked && (
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 dark:bg-amber-600 text-xs font-bold text-white">
                      ✓
                    </span>
                  )}
                  <span className={`font-medium text-sm ${r.picked ? "text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}>
                    {r.driverName}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Race {r.raceNumber}</span>
                  {r.gate != null && <span>Gate {r.gate}</span>}
                </div>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={pickRandom}
            className="mt-4 gap-2"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Re-roll selection
          </Button>
        </div>
      )}
    </div>
  );
}
