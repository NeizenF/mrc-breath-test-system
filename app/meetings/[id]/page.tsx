"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { importMrcUrl, importMrcHtml } from "@/lib/importMrcUrl";
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
  const [bulkUrls, setBulkUrls] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem(`bulk-mrc-urls-${meetingId}`) ?? "") : ""
  );
  const [urlsReady, setUrlsReady] = useState(false);
  const [createRacesOpen, setCreateRacesOpen] = useState(false);
  const [createRacesInput, setCreateRacesInput] = useState("");
  const [singleMrcOpen, setSingleMrcOpen] = useState(false);
  const [singleMrcInput, setSingleMrcInput] = useState("");
  const [pasteHtmlOpen, setPasteHtmlOpen] = useState(false);
  const [pasteHtmlInput, setPasteHtmlInput] = useState("");
  const [pasteHtmlImporting, setPasteHtmlImporting] = useState(false);
  const [pasteHtmlLog, setPasteHtmlLog] = useState<{ race: number; count: number; error?: string }[]>([]);

  const [extensionId, setExtensionId] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncLog, setSyncLog] = useState<{ text: string; ok: boolean }[]>([]);
  const [mrcMeetingUrl, setMrcMeetingUrl] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem(`mrc-meeting-url-${meetingId}`) ?? "") : ""
  );

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
    setUrlsReady(true);
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

  async function importFromPastedHtml() {
    if (!pasteHtmlInput.trim()) return;
    setPasteHtmlImporting(true);
    try {
      const result = await importMrcHtml(pasteHtmlInput.trim(), meetingId);
      setPasteHtmlLog((prev) => [...prev, { race: result.raceNumber, count: result.importedCount }]);
      setPasteHtmlInput("");
      await load();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Import failed.";
      setPasteHtmlLog((prev) => [...prev, { race: 0, count: 0, error: msg }]);
    } finally {
      setPasteHtmlImporting(false);
    }
  }

  function closePasteHtml() {
    setPasteHtmlOpen(false);
    setPasteHtmlInput("");
    setPasteHtmlLog([]);
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
    await saveUrlsToSupabase();

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

  // Detect Chrome extension via DOM attribute set by content script
  useEffect(() => {
    const check = () => {
      const id = document.documentElement.getAttribute("data-mrc-extension-id");
      if (id) setExtensionId(id);
    };
    check();
    const t = setTimeout(check, 500);
    return () => clearTimeout(t);
  }, []);

  // Listen for progress events from extension
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.event === "start") {
        setSyncLog([{ text: `Found ${detail.total} races — importing…`, ok: true }]);
      } else if (detail.event === "race-done") {
        setSyncLog((prev) => [...prev, { text: `✓ Race ${detail.raceNumber} — ${detail.importedCount} entries`, ok: true }]);
        if (detail.index === detail.total - 1) {
          setSyncRunning(false);
          load();
        }
      } else if (detail.event === "race-error") {
        setSyncLog((prev) => [...prev, { text: `✗ Race ${detail.index + 1}: ${detail.message}`, ok: false }]);
        if (detail.index === detail.total - 1) {
          setSyncRunning(false);
          load();
        }
      } else if (detail.event === "done") {
        setSyncRunning(false);
        load();
      } else if (detail.event === "error") {
        setSyncLog((prev) => [...prev, { text: `✗ ${detail.message}`, ok: false }]);
        setSyncRunning(false);
      }
    };
    window.addEventListener("mrc-import-progress", handler);
    return () => window.removeEventListener("mrc-import-progress", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startSync() {
    if (!extensionId || !mrcMeetingUrl.trim()) return;
    setSyncRunning(true);
    setSyncLog([{ text: "Starting…", ok: true }]);
    localStorage.setItem(`mrc-meeting-url-${meetingId}`, mrcMeetingUrl.trim());

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setSyncLog([{ text: "✗ Not logged in.", ok: false }]);
      setSyncRunning(false);
      return;
    }

    (window as unknown as { chrome: { runtime: { sendMessage: (id: string, msg: unknown) => void } } })
      .chrome.runtime.sendMessage(extensionId, {
        type: "import-meeting",
        meetingUrl: mrcMeetingUrl.trim(),
        meetingId,
        token,
      });
  }

  // Save to localStorage immediately + sync to Supabase after 400ms idle.
  // urlsReady gates this so the initial empty render doesn't wipe saved data.
  useEffect(() => {
    if (!meetingId || !urlsReady) return;
    localStorage.setItem(bulkUrlsStorageKey, bulkUrls);
    const t = setTimeout(async () => {
      const { error } = await supabase.from("meetings").update({ import_urls: bulkUrls }).eq("id", meetingId);
      if (error) console.error("Failed to save import URLs to Supabase:", error);
    }, 400);
    return () => clearTimeout(t);
  }, [bulkUrls, meetingId, bulkUrlsStorageKey, urlsReady]);

  async function saveUrlsToSupabase() {
    const { error } = await supabase.from("meetings").update({ import_urls: bulkUrls }).eq("id", meetingId);
    if (error) console.error("Failed to save import URLs:", error);
  }

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

            <Button
              variant="outline"
              onClick={() => setPasteHtmlOpen(true)}
              disabled={updatingMrc || bulkImporting || pasteHtmlImporting}
            >
              Paste page source
            </Button>

            {extensionId && (
              <Button
                variant="outline"
                onClick={() => { setSyncLog([]); setSyncOpen(true); }}
                disabled={syncRunning}
              >
                {syncRunning ? "Syncing…" : "Sync from MRC"}
              </Button>
            )}

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

      {/* Sync from MRC dialog */}
      <Dialog open={syncOpen} onOpenChange={(o) => { if (!o && !syncRunning) { setSyncOpen(false); setSyncLog([]); } }}>
        <DialogContent showCloseButton={false} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Sync from MRC</DialogTitle>
            <DialogDescription>
              Paste the MRC meeting page URL. The extension will open it in the background and import all races automatically.
            </DialogDescription>
          </DialogHeader>

          <Input
            type="url"
            placeholder="https://maltaracingclub.com/meeting.php?id=..."
            value={mrcMeetingUrl}
            onChange={(e) => setMrcMeetingUrl(e.target.value)}
            disabled={syncRunning}
          />

          {syncLog.length > 0 && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 space-y-1 max-h-48 overflow-y-auto">
              {syncLog.map((entry, i) => (
                <p key={i} className={`text-sm ${entry.ok ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
                  {entry.text}
                </p>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setSyncOpen(false); setSyncLog([]); }} disabled={syncRunning}>
              {syncLog.some(e => e.text.startsWith("✓")) ? "Done" : "Cancel"}
            </Button>
            <Button onClick={startSync} disabled={syncRunning || !mrcMeetingUrl.trim()}>
              {syncRunning ? "Syncing…" : "Sync all races"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paste HTML dialog */}
      <Dialog open={pasteHtmlOpen} onOpenChange={(o) => { if (!o) closePasteHtml(); }}>
        <DialogContent showCloseButton={false} className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import from MRC</DialogTitle>
            <DialogDescription asChild>
              <ol className="mt-1 list-decimal pl-4 text-sm space-y-1">
                <li>Open the MRC race page in your browser</li>
                <li>Press <kbd className="rounded border px-1 py-0.5 text-xs font-mono bg-muted">Ctrl+U</kbd> to open page source</li>
                <li>Press <kbd className="rounded border px-1 py-0.5 text-xs font-mono bg-muted">Ctrl+A</kbd> then <kbd className="rounded border px-1 py-0.5 text-xs font-mono bg-muted">Ctrl+C</kbd> to copy all</li>
                <li>Click below and press <kbd className="rounded border px-1 py-0.5 text-xs font-mono bg-muted">Ctrl+V</kbd> to paste</li>
              </ol>
            </DialogDescription>
          </DialogHeader>

          {/* Log of imported races */}
          {pasteHtmlLog.length > 0 && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 space-y-1">
              {pasteHtmlLog.map((entry, i) =>
                entry.error ? (
                  <p key={i} className="text-sm text-destructive">✗ {entry.error}</p>
                ) : (
                  <p key={i} className="text-sm text-green-600 dark:text-green-400">✓ Race {entry.race} — {entry.count} entries imported</p>
                )
              )}
            </div>
          )}

          <textarea
            value={pasteHtmlInput}
            onChange={(e) => setPasteHtmlInput(e.target.value)}
            placeholder="Paste source here (Ctrl+V)…"
            className="min-h-[160px] w-full rounded-md border bg-background px-3 py-2 text-sm font-mono outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            autoFocus
          />

          <DialogFooter>
            <Button variant="outline" onClick={closePasteHtml}>
              {pasteHtmlLog.length > 0 ? "Done" : "Cancel"}
            </Button>
            <Button onClick={importFromPastedHtml} disabled={pasteHtmlImporting || !pasteHtmlInput.trim()}>
              {pasteHtmlImporting ? "Importing…" : "Import race"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}