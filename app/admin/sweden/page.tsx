"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2, ImageOff, Video } from "lucide-react";

// ── ATG API types ──────────────────────────────────────────────────────────────

const ATG = "https://www.atg.se/services/racinginfo/v1/api";
const PHOTO = "https://api.travsport.se/customerapi/TROT/SPORT/photofinish/image";

type CalTrack = {
  id: number; name: string; startTime: string; sport: string;
  races: { id: string; number: number; status: "results" | "upcoming" | "ongoing"; startTime: string }[];
};

type RaceTime = { minutes: number; seconds: number; tenths: number };

type RaceStart = {
  id: string; number: number; postPosition: number; distance: number;
  scratched?: boolean;
  horse: {
    id: number; name: string; age: number; sex: string; nationality: string; color?: string;
    record?: { time: RaceTime };
    trainer?: { firstName: string; lastName: string };
    owner?: { name: string };
  };
  driver: { id: number; firstName: string; lastName: string };
  result?: { place: number; kmTime?: RaceTime; prizeMoney?: number; finalOdds?: number };
  odds?: { odds: number };
};

type RaceDetail = {
  id: string; name: string; number: number; distance: number;
  startMethod: string; prize?: string; status: string;
  track: { id: number; name: string; condition?: string };
  starts: RaceStart[];
  result?: { victoryMargin?: string };
  mediaId?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayISO() { return new Date().toISOString().split("T")[0]; }

function fmtTime(t: RaceTime) {
  return `${t.minutes}:${String(t.seconds).padStart(2, "0")}.${t.tenths}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function PlaceBadge({ place }: { place: number }) {
  const map: Record<number, string> = {
    1: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    2: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
    3: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200",
  };
  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${map[place] ?? "bg-slate-50 text-slate-400 dark:bg-slate-800"}`}>
      {place}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SwedenPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const [date, setDate]             = useState(todayISO());
  const [tracks, setTracks]         = useState<CalTrack[]>([]);
  const [trackIdx, setTrackIdx]     = useState(0);
  const [raceId, setRaceId]         = useState<string | null>(null);
  const [race, setRace]             = useState<RaceDetail | null>(null);

  const [loadingCal, setLoadingCal] = useState(false);
  const [loadingRace, setLoadingRace] = useState(false);

  // Photo finish state
  const [showPhoto, setShowPhoto]   = useState(false);
  const [photoMeeting, setPhotoMeeting] = useState(1);
  const [photoRace, setPhotoRace]   = useState(1);
  const [photoState, setPhotoState] = useState<"loading"|"ok"|"error">("loading");

  // Auth check
  useEffect(() => {
    let mounted = true;
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session) { router.replace("/"); return; }
      const admin = await isCurrentUserAdmin();
      if (!mounted) return;
      if (!admin) { router.replace("/dashboard"); return; }
      setReady(true);
    }
    init();
    return () => { mounted = false; };
  }, [router]);

  // Fetch calendar when date changes
  useEffect(() => {
    if (!ready) return;
    setLoadingCal(true);
    setTracks([]);
    setRace(null);
    setRaceId(null);
    fetch(`${ATG}/calendar/day/${date}`)
      .then((r) => r.json())
      .then((d) => {
        const trot = (d.tracks ?? []).filter((t: CalTrack) => t.sport === "trot");
        setTracks(trot);
        setTrackIdx(0);
        const firstRace = trot[0]?.races[0]?.id ?? null;
        setRaceId(firstRace);
      })
      .catch(() => setTracks([]))
      .finally(() => setLoadingCal(false));
  }, [date, ready]);

  // Fetch race details when race selected
  useEffect(() => {
    if (!raceId) { setRace(null); return; }
    setLoadingRace(true);
    setRace(null);
    fetch(`${ATG}/races/${raceId}`)
      .then((r) => r.json())
      .then(setRace)
      .catch(() => setRace(null))
      .finally(() => setLoadingRace(false));
  }, [raceId]);

  function shiftDate(d: number) {
    const dt = new Date(date);
    dt.setDate(dt.getDate() + d);
    setDate(dt.toISOString().split("T")[0]);
  }

  const track = tracks[trackIdx] ?? null;
  const photoUrl = `${PHOTO}/${date}/${photoMeeting}/${photoRace}`;

  // Reset photo state when URL changes
  useEffect(() => { setPhotoState("loading"); }, [photoUrl]);

  const starts = race?.starts ?? [];
  const isResults = race?.status === "results";
  const sorted = isResults
    ? [...starts].sort((a, b) => (a.result?.place ?? 99) - (b.result?.place ?? 99))
    : [...starts].sort((a, b) => a.postPosition - b.postPosition);

  if (!ready) return null;

  return (
    <div className="p-4 md:p-6">
      <div className="mb-2">
        <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Sweden" }]} />
      </div>
      <div className="mb-5 mt-4">
        <h1 className="text-xl font-semibold tracking-tight">Sweden — ATG Racing</h1>
        <p className="mt-1 text-sm text-muted-foreground">Swedish trotting race cards and results via ATG.</p>
      </div>

      {/* Date navigator */}
      <div className="mb-5 flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftDate(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <input
          type="date"
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        />
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftDate(1)} disabled={date >= todayISO()}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        {loadingCal && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Track tabs */}
      {tracks.length > 1 && (
        <div className="mb-4 flex gap-2 flex-wrap">
          {tracks.map((t, i) => (
            <Button
              key={t.id}
              variant={trackIdx === i ? "default" : "outline"}
              size="sm"
              onClick={() => { setTrackIdx(i); setRaceId(t.races[0]?.id ?? null); }}
            >
              {t.name}
            </Button>
          ))}
        </div>
      )}

      {tracks.length === 0 && !loadingCal && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No trotting races found for this date.</CardContent></Card>
      )}

      {track && (
        <>
          {/* Race selector */}
          <div className="mb-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{track.name}</p>
            <div className="flex flex-wrap gap-1.5">
              {track.races.map((r) => {
                const isSelected = raceId === r.id;
                const color = r.status === "results"
                  ? isSelected ? "bg-emerald-600 text-white border-emerald-600" : "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                  : r.status === "ongoing"
                  ? isSelected ? "bg-blue-600 text-white border-blue-600" : "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400"
                  : isSelected ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-transparent" : "";
                return (
                  <button
                    key={r.id}
                    onClick={() => setRaceId(r.id)}
                    className={`flex flex-col items-center rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${color} ${!isSelected ? "bg-white dark:bg-slate-800" : ""}`}
                  >
                    <span className="text-sm font-semibold">R{r.number}</span>
                    <span className="text-[10px] opacity-70">{fmtDate(r.startTime)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Race detail */}
          {loadingRace ? (
            <Card><CardContent className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></CardContent></Card>
          ) : race ? (
            <div className="space-y-4">
              {/* Race header */}
              <Card>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{race.name}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {race.distance}m · {race.startMethod === "auto" ? "Autostart" : "Voltstart"} ·{" "}
                        <span className={`font-medium ${isResults ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-blue-400"}`}>
                          {isResults ? "Results" : "Upcoming"}
                        </span>
                      </p>
                      {race.track.condition && (
                        <p className="mt-0.5 text-xs text-muted-foreground">Track: {race.track.condition}</p>
                      )}
                    </div>
                    {isResults && race.result?.victoryMargin && (
                      <span className="rounded-full bg-emerald-50 dark:bg-emerald-950 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        Margin: {race.result.victoryMargin}
                      </span>
                    )}
                  </div>
                  {race.prize && (
                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{race.prize}</p>
                  )}
                </CardContent>
              </Card>

              {/* Starts table */}
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-700">
                          {isResults && <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Place</th>}
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">#</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Horse</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Driver</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground hidden sm:table-cell">Trainer</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Record</th>
                          {isResults
                            ? <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Time / Odds</th>
                            : <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Odds</th>
                          }
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.map((s) => (
                          <tr key={s.id} className={`border-b border-slate-50 dark:border-slate-800 last:border-0 ${s.scratched ? "opacity-40" : ""}`}>
                            {isResults && (
                              <td className="px-4 py-2.5">
                                {s.result ? <PlaceBadge place={s.result.place} /> : <span className="text-xs text-muted-foreground">—</span>}
                              </td>
                            )}
                            <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{s.postPosition}</td>
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-slate-900 dark:text-slate-100">{s.horse.name}</p>
                              <p className="text-xs text-muted-foreground">{s.horse.age}yo {s.horse.sex} · {s.horse.nationality}</p>
                            </td>
                            <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              {s.driver.firstName} {s.driver.lastName}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                              {s.horse.trainer ? `${s.horse.trainer.firstName} ${s.horse.trainer.lastName}` : "—"}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-400">
                              {s.horse.record?.time ? fmtTime(s.horse.record.time) : "—"}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {isResults && s.result?.kmTime ? (
                                <div>
                                  <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">{fmtTime(s.result.kmTime)}</p>
                                  {s.result.finalOdds && <p className="text-xs text-muted-foreground">{s.result.finalOdds.toFixed(2)}</p>}
                                </div>
                              ) : s.odds?.odds ? (
                                <span className="font-mono text-sm">{s.odds.odds.toFixed(2)}</span>
                              ) : <span className="text-xs text-muted-foreground">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Stream / replay link */}
              {race.mediaId && (
                <a
                  href={`https://www.atg.se/sport/video/lopp?mediaId=${race.mediaId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Video className="h-4 w-4 text-red-500" />
                  Watch on ATG {isResults ? "(Replay)" : "(Live)"}
                </a>
              )}
              {!race.mediaId && (
                <a
                  href={`https://www.atg.se/sport/resultat/${date}/${race.track.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Video className="h-4 w-4 text-slate-400" />
                  View on ATG ↗
                </a>
              )}

              {/* Photo finish toggle */}
              <div>
                <button
                  onClick={() => setShowPhoto(!showPhoto)}
                  className="text-sm font-medium text-muted-foreground hover:text-slate-900 dark:hover:text-slate-100 underline underline-offset-2"
                >
                  {showPhoto ? "Hide photo finish" : "View photo finish (Travsport) ↓"}
                </button>

                {showPhoto && (
                  <Card className="mt-3">
                    <CardContent className="pt-4 pb-4 px-4">
                      <div className="mb-3 flex flex-wrap items-end gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-muted-foreground">Meeting #</label>
                          <div className="flex gap-1">{[1,2,3].map(m => (
                            <Button key={m} variant={photoMeeting===m?"default":"outline"} size="sm" className="w-9" onClick={()=>setPhotoMeeting(m)}>{m}</Button>
                          ))}</div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-muted-foreground">Race #</label>
                          <div className="flex gap-1">{Array.from({length:12},(_,i)=>i+1).map(r => (
                            <Button key={r} variant={photoRace===r?"default":"outline"} size="sm" className="w-9" onClick={()=>setPhotoRace(r)}>{r}</Button>
                          ))}</div>
                        </div>
                      </div>
                      <div className="relative flex min-h-[120px] items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        {photoState === "loading" && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
                        {photoState === "error" && (
                          <div className="flex flex-col items-center gap-1 text-slate-400">
                            <ImageOff className="h-6 w-6" />
                            <p className="text-xs">No photo available</p>
                          </div>
                        )}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          key={photoUrl}
                          src={photoUrl}
                          alt="Photo finish"
                          className={`w-full rounded-lg ${photoState==="ok"?"opacity-100":"opacity-0"}`}
                          onLoad={()=>setPhotoState("ok")}
                          onError={()=>setPhotoState("error")}
                        />
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
