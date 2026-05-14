"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Search, Trophy, AlertTriangle, Clock } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type LastPerf = {
  date: string;
  class: string;
  driverAbbr: string;
  place: string;
  timePerKm: string;
  distance: string;
};

type HistoryEntry = {
  meetingDate: string;
  raceClass: string;
  raceType: string;
  distance: string;
  driver: string;
  position: string;
  time: string;
};

type HorseEntry = {
  gate: number;
  horseName: string;
  horseId: string;
  country: string;
  sex: string;
  age: string;
  sire: string;
  dam: string;
  owner: string;
  points: number;
  lastPerfs: LastPerf[];
  todayDriver: string;
  profile: {
    foreignCareer: string;
    yearStats: { year: string; starts: number; first: number; second: number; third: number; dis: number }[];
    raceHistory: HistoryEntry[];
  } | null;
};

type RaceResult = {
  race: {
    titleText: string;
    raceClass: string;
    distance: number;
    raceName: string;
    dateStr: string;
    raceType: string;
  };
  horses: HorseEntry[];
  analysis: string;
  analysisError: string;
};

// ── Markdown renderer ─────────────────────────────────────────────────────────

function RenderMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) {
          return <h4 key={i} className="font-semibold text-sm mt-4 text-slate-900 dark:text-slate-100">{line.slice(4)}</h4>;
        }
        if (line.startsWith("## ")) {
          return <h3 key={i} className="font-bold text-base mt-5 text-slate-900 dark:text-slate-100">{line.slice(3)}</h3>;
        }
        if (line.startsWith("# ")) {
          return <h2 key={i} className="font-bold text-lg mt-5 text-slate-900 dark:text-slate-100">{line.slice(2)}</h2>;
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
          return (
            <p key={i} className="text-sm leading-relaxed pl-3 text-slate-700 dark:text-slate-300">
              {"• "}{renderInline(line.slice(2))}
            </p>
          );
        }
        if (/^\d+\./.test(line)) {
          return (
            <p key={i} className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {renderInline(line)}
            </p>
          );
        }
        if (line.trim() === "" || line.startsWith("===") || line.startsWith("---")) {
          return <div key={i} className="h-1" />;
        }
        return (
          <p key={i} className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {renderInline(line)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-slate-900 dark:text-slate-100">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

// ── Position badge ────────────────────────────────────────────────────────────

function PosBadge({ pos }: { pos: string }) {
  const p = pos.trim().toUpperCase();
  if (p === "DIS" || p === "DISQUALIFIED") {
    return <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">DIS</span>;
  }
  if (p === "NP") {
    return <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">NP</span>;
  }
  const n = parseInt(p);
  if (n === 1) return <span className="inline-block rounded px-1.5 py-0.5 text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">1st</span>;
  if (n === 2) return <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">2nd</span>;
  if (n === 3) return <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">3rd</span>;
  if (!isNaN(n)) return <span className="inline-block rounded px-1.5 py-0.5 text-xs text-slate-500 dark:text-slate-400">{n}th</span>;
  return <span className="text-xs text-muted-foreground">{pos || "—"}</span>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RaceAnalyserPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [extId, setExtId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<RaceResult | null>(null);
  const [loadingMsg, setLoadingMsg] = useState("");

  useEffect(() => {
    let mounted = true;
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session) { router.replace("/"); return; }
      const admin = await isCurrentUserAdmin();
      if (!mounted) return;
      if (!admin) { router.replace("/dashboard"); return; }
      setExtId(document.documentElement.getAttribute("data-mrc-extension-id"));
      setCheckingAccess(false);
    }
    init();
    return () => { mounted = false; };
  }, [router]);

  async function analyse() {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setLoadingMsg("Fetching race card...");

    if (extId) {
      // Extension mode: browser fetches MRC pages (bypasses Cloudflare)
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      const handler = (e: Event) => {
        const d = (e as CustomEvent<Record<string, unknown>>).detail;
        if (d.event === "profiles-start") {
          setLoadingMsg(`Loading horse profiles (0/${d.total})...`);
        } else if (d.event === "profile-done") {
          setLoadingMsg(`Loading horse profiles (${d.index}/${d.total})...`);
        } else if (d.event === "analysing") {
          setLoadingMsg("Running AI analysis...");
        } else if (d.event === "analyse-done") {
          window.removeEventListener("mrc-import-progress", handler);
          setResult(d.result as RaceResult);
          setLoading(false);
          setLoadingMsg("");
        } else if (d.event === "analyse-error") {
          window.removeEventListener("mrc-import-progress", handler);
          setError((d.message as string) ?? "Analysis failed.");
          setLoading(false);
          setLoadingMsg("");
        }
      };

      window.addEventListener("mrc-import-progress", handler);
      (window as { chrome?: { runtime?: { sendMessage?: (...args: unknown[]) => void } } })
        .chrome?.runtime?.sendMessage(extId, {
          type: "analyse-race",
          raceUrl: url.trim(),
          token,
        });
      return;
    }

    // Fallback: direct API call (may fail if Cloudflare blocks server-side fetch)
    const msgs = ["Fetching race card...", "Loading horse profiles...", "Running AI analysis..."];
    let idx = 0;
    const interval = setInterval(() => {
      idx = (idx + 1) % msgs.length;
      setLoadingMsg(msgs[idx]);
    }, 3500);

    try {
      const res = await fetch("/api/race-analyser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setResult(data);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      clearInterval(interval);
      setLoading(false);
      setLoadingMsg("");
    }
  }

  if (checkingAccess) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  }

  const classBadgeColor: Record<string, string> = {
    Premier: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    Gold: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
    Silver: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
    Bronze: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
    Copper: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <div className="mb-2">
        <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Race Analyser" }]} />
      </div>
      <div className="mb-5 mt-4">
        <h1 className="text-xl font-semibold tracking-tight">Race Analyser</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste any MRC race link — we'll pull every horse's profile and generate AI predictions.
        </p>
        {extId ? (
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">Extension detected — MRC pages will load via browser.</p>
        ) : (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Extension not detected — install the MRC extension for best results.</p>
        )}
      </div>

      {/* Input */}
      <Card className="mb-6">
        <CardContent className="pt-5 pb-5">
          <label className="block mb-1.5 text-sm font-medium">MRC Race URL</label>
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && analyse()}
              placeholder="https://maltaracingclub.com/race.php?id=9226"
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button onClick={analyse} disabled={loading || !url.trim()}>
              <Search className="h-4 w-4 mr-1.5" />
              {loading ? "Analysing..." : "Analyse"}
            </Button>
          </div>
          {error && (
            <p className="mt-2 text-sm text-red-600 dark:text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 animate-spin" />
            {loadingMsg}
          </div>
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-6">

          {/* Race header */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${classBadgeColor[result.race.raceClass] ?? "bg-slate-100 text-slate-600"}`}>
                Class {result.race.raceClass}
              </span>
              <span className="text-xs text-muted-foreground">{result.race.distance}m · {result.race.raceType}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{result.race.dateStr}</span>
            </div>
            <h2 className="font-semibold text-base">{result.race.raceName || result.race.titleText}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{result.horses.length} runners</p>
          </div>

          {/* AI Analysis */}
          {result.analysis ? (
            <Card>
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  <span className="font-semibold text-sm">AI Prediction</span>
                  <span className="text-xs text-muted-foreground ml-auto">Powered by Gemini</span>
                </div>
                <RenderMarkdown text={result.analysis} />
              </CardContent>
            </Card>
          ) : result.analysisError ? (
            <Card>
              <CardContent className="py-4">
                <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  AI analysis unavailable: {result.analysisError}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {/* Horse data table */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Race Card Data</p>
            <div className="space-y-3">
              {result.horses.map((h) => {
                const totalStarts = h.profile?.yearStats?.reduce((s, y) => s + y.starts, 0) ?? 0;
                const totalWins   = h.profile?.yearStats?.reduce((s, y) => s + y.first, 0) ?? 0;
                const totalDis    = h.profile?.yearStats?.reduce((s, y) => s + y.dis, 0) ?? 0;
                const disRate     = totalStarts > 0 ? Math.round((totalDis / totalStarts) * 100) : 0;

                return (
                  <Card key={h.horseName}>
                    <CardContent className="pt-4 pb-4">
                      {/* Horse header */}
                      <div className="flex flex-wrap items-start gap-x-4 gap-y-1 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-muted-foreground w-6 text-center shrink-0">
                            {h.gate}
                          </span>
                          <a
                            href={`https://maltaracingclub.com/horse/${h.horseId}/${h.horseName.replace(/\s+/g, "-")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-sm uppercase hover:underline"
                          >
                            {h.horseName}
                          </a>
                          <span className="text-xs text-muted-foreground">{h.sex}/{h.age} ({h.country})</span>
                        </div>
                        <div className="flex items-center gap-3 ml-auto flex-wrap">
                          <span className="text-xs text-muted-foreground">{h.points} pts</span>
                          {totalStarts > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {totalStarts} starts · {totalWins}W
                              {disRate > 20 && (
                                <span className="ml-1 text-red-500">· {disRate}% DIS</span>
                              )}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">Driver: <span className="font-medium text-slate-700 dark:text-slate-300">{h.todayDriver}</span></span>
                        </div>
                      </div>

                      {/* Last 3 perfs */}
                      {h.lastPerfs.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Last {h.lastPerfs.length} races</p>
                          {h.lastPerfs.map((p, i) => (
                            <div key={i} className="flex items-center gap-3 text-xs flex-wrap">
                              <span className="text-muted-foreground w-16 shrink-0">{p.date}</span>
                              <span className={`rounded px-1.5 py-0.5 font-medium ${classBadgeColor[p.class] ?? "bg-slate-100 text-slate-500"}`}>
                                {p.class}
                              </span>
                              <span className="text-muted-foreground">{p.distance}</span>
                              <PosBadge pos={p.place} />
                              {p.timePerKm && (
                                <span className="font-mono text-slate-600 dark:text-slate-300">{p.timePerKm}/km</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Foreign career */}
                      {h.profile?.foreignCareer && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          <span className="font-medium">Foreign career:</span> {h.profile.foreignCareer}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
