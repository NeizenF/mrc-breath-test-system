"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { importMrcUrl } from "@/lib/importMrcUrl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateLong } from "@/lib/formatters";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Meeting = {
  id: string;
  title: string | null;
  meeting_date: string | null;
  import_urls: string | null;
};

type Race = {
  id: string;
  race_number: number;
  race_time: string | null;
  race_distance: string | null;
  race_class: string | null;
};


export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meetingId = params.id;
  const bulkUrlsStorageKey = `bulk-mrc-urls-${meetingId}`;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingMrc, setUpdatingMrc] = useState(false);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkUrls, setBulkUrls] = useState("");
  const [createRacesOpen, setCreateRacesOpen] = useState(false);
  const [createRacesInput, setCreateRacesInput] = useState("");
  const [singleMrcOpen, setSingleMrcOpen] = useState(false);
  const [singleMrcInput, setSingleMrcInput] = useState("");

  async function load() {
    setLoading(true);

    const { data: m, error: meetingError } = await supabase
      .from("meetings")
      .select("id,title,meeting_date,import_urls")
      .eq("id", meetingId)
      .single();

    if (meetingError) {
      toast.error(meetingError.message);
      setLoading(false);
      return;
    }

    const { data: r, error: racesError } = await supabase
      .from("races")
      .select("id,race_number,race_time,race_distance,race_class")
      .eq("meeting_id", meetingId)
      .order("race_number", { ascending: true });

    if (racesError) {
      toast.error(racesError.message);
      setLoading(false);
      return;
    }

    const mtg = (m as Meeting) || null;
    setMeeting(mtg);
    setRaces((r as Race[]) || []);
    // Supabase is source of truth; fall back to localStorage if column is empty
    if (mtg?.import_urls != null) {
      setBulkUrls(mtg.import_urls);
    } else {
      const local = localStorage.getItem(bulkUrlsStorageKey);
      if (local) setBulkUrls(local);
    }
    setLoading(false);
  }

  async function createRaces(nStr: string) {
    setCreateRacesOpen(false);
    setCreateRacesInput("");

    const n = Number(nStr);
    if (!Number.isFinite(n) || n < 1 || n > 30) {
      toast.error("Enter a number between 1 and 30.");
      return;
    }

    const existing = new Set(races.map((x) => x.race_number));
    const toInsert = Array.from({ length: n }, (_, i) => i + 1)
      .filter((num) => !existing.has(num))
      .map((num) => ({
        meeting_id: meetingId,
        race_number: num,
      }));

    if (toInsert.length === 0) {
      toast.error("Those races already exist.");
      return;
    }

    const { error } = await supabase.from("races").insert(toInsert);
    if (error) {
      toast.error(error.message);
      return;
    }

    await load();
  }

  async function updateFromMrc(url: string) {
    setSingleMrcOpen(false);
    setSingleMrcInput("");
    setUpdatingMrc(true);

    try {
      const result = await importMrcUrl(url, meetingId);
      await load();
      toast.success(`Imported ${result.importedCount} entries for race ${result.raceNumber}.`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setUpdatingMrc(false);
    }
  }

  async function bulkUpdateFromMrc() {
    const urls = bulkUrls
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      toast.error("Paste at least one race link.");
      return;
    }

    setBulkImporting(true);

    try {
      const results: string[] = [];

      for (const url of urls) {
        const result = await importMrcUrl(url, meetingId);
        results.push(`Race ${result.raceNumber}: ${result.importedCount} entries`);
      }

      await load();
      toast.success(`Bulk import complete. ${results.join(", ")}`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Bulk import failed.");
    } finally {
      setBulkImporting(false);
    }
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/login");
        return;
      }

      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  // Save to localStorage immediately + sync to Supabase after 1.5s idle
  useEffect(() => {
    if (!meetingId) return;
    localStorage.setItem(bulkUrlsStorageKey, bulkUrls);
    const t = setTimeout(() => {
      supabase.from("meetings").update({ import_urls: bulkUrls }).eq("id", meetingId);
    }, 1500);
    return () => clearTimeout(t);
  }, [bulkUrls, meetingId, bulkUrlsStorageKey]);

  const title = useMemo(() => {
    if (!meeting) return "Meeting";
    return meeting.title ?? `Meeting ${meeting.meeting_date ?? ""}`.trim();
  }, [meeting]);

  return (
    <div className="min-h-screen p-6 bg-slate-100 dark:bg-slate-900">
      <div className="max-w-5xl mx-auto space-y-6">
        <Breadcrumbs items={[
          { label: "Meetings", href: "/admin/meetings" },
          { label: title },
        ]} />

        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">
              {meeting?.meeting_date
                ? `Date: ${formatDateLong(meeting.meeting_date)}`
                : "—"}
            </p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/")}>
              Home
            </Button>

            <Button variant="outline" onClick={() => router.push("/admin/meetings")}>
              Meetings
            </Button>

            <Button
              variant="outline"
              onClick={() => setSingleMrcOpen(true)}
              disabled={updatingMrc || bulkImporting}
            >
              {updatingMrc ? "Updating..." : "Update one race"}
            </Button>

            <Button onClick={() => setCreateRacesOpen(true)}>Create races</Button>

            <Button
              variant="outline"
              onClick={() => router.push(`/meetings/${meetingId}/print`)}
            >
              Print page
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Bulk import from MRC</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Paste one MRC race link per line. Links are saved and sync across all devices.
            </p>

            <textarea
              value={bulkUrls}
              onChange={(e) => setBulkUrls(e.target.value)}
              placeholder={`https://maltaracingclub.com/...\nhttps://maltaracingclub.com/...\nhttps://maltaracingclub.com/...`}
              className="min-h-[140px] w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />

            <div className="flex gap-2">
              <Button onClick={bulkUpdateFromMrc} disabled={bulkImporting || updatingMrc}>
                {bulkImporting ? "Importing..." : "Import all links"}
              </Button>

              <Button
                variant="outline"
                onClick={() => setBulkUrls("")}
                disabled={bulkImporting}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Races</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {loading && (
              <span className="text-sm text-muted-foreground">Loading…</span>
            )}

            {!loading && races.length === 0 && (
              <span className="text-sm text-muted-foreground">
                No races yet. Click “Create races” or import from MRC.
              </span>
            )}

            {races.map((r) => (
              <Button
                key={r.id}
                variant="secondary"
                className="h-auto justify-between py-3"
                onClick={() =>
                  router.push(`/meetings/${meetingId}/raceday?race=${r.race_number}`)
                }
              >
                <div className="flex flex-col items-start text-left">
                  <span className="font-medium">Race {r.race_number}</span>
                  <span className="text-xs text-muted-foreground">
                    {[r.race_time, r.race_distance, r.race_class]
                      .filter(Boolean)
                      .join(" • ") || "No extra info yet"}
                  </span>
                </div>

                <span className="ml-2 rounded-md border px-2 py-1 text-xs">
                  Open
                </span>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Create races dialog */}
      <Dialog open={createRacesOpen} onOpenChange={(o) => { if (!o) { setCreateRacesOpen(false); setCreateRacesInput(""); } }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Create races</DialogTitle>
            <DialogDescription>How many races? (1–30)</DialogDescription>
          </DialogHeader>
          <Input
            type="number"
            min={1}
            max={30}
            placeholder="e.g. 10"
            value={createRacesInput}
            onChange={(e) => setCreateRacesInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createRaces(createRacesInput); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateRacesOpen(false); setCreateRacesInput(""); }}>Cancel</Button>
            <Button onClick={() => createRaces(createRacesInput)}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single MRC import dialog */}
      <Dialog open={singleMrcOpen} onOpenChange={(o) => { if (!o) { setSingleMrcOpen(false); setSingleMrcInput(""); } }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Update one race</DialogTitle>
            <DialogDescription>Paste the MRC race link below.</DialogDescription>
          </DialogHeader>
          <Input
            type="url"
            placeholder="https://maltaracingclub.com/..."
            value={singleMrcInput}
            onChange={(e) => setSingleMrcInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && singleMrcInput.trim()) updateFromMrc(singleMrcInput.trim()); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSingleMrcOpen(false); setSingleMrcInput(""); }}>Cancel</Button>
            <Button onClick={() => singleMrcInput.trim() && updateFromMrc(singleMrcInput.trim())} disabled={updatingMrc}>
              {updatingMrc ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}