"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ImageOff, Loader2 } from "lucide-react";

const BASE = "https://api.travsport.se/customerapi/TROT/SPORT/photofinish/image";
const MAX_RACES = 15;

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export default function SwedenPage() {
  const router = useRouter();
  const [checkingAccess, setCheckingAccess] = useState(true);

  const [date, setDate] = useState(todayISO());
  const [meeting, setMeeting] = useState(1);
  const [race, setRace] = useState(1);
  const [availableRaces, setAvailableRaces] = useState<number[]>([]);
  const [probing, setProbing] = useState(false);
  const [imgState, setImgState] = useState<"loading" | "ok" | "error">("loading");

  const abortRef = useRef<AbortController | null>(null);

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
    }
    init();
    return () => { mounted = false; };
  }, [router]);

  // Probe which race numbers exist for the selected date + meeting
  useEffect(() => {
    if (checkingAccess) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setProbing(true);
    setAvailableRaces([]);

    const checks = Array.from({ length: MAX_RACES }, (_, i) => i + 1).map((r) =>
      fetch(`${BASE}/${date}/${meeting}/${r}`, { method: "HEAD", signal: ctrl.signal })
        .then((res) => (res.ok ? r : null))
        .catch(() => null)
    );

    Promise.all(checks).then((results) => {
      if (ctrl.signal.aborted) return;
      const found = results.filter((r): r is number => r !== null);
      setAvailableRaces(found);
      setRace(found[0] ?? 1);
      setProbing(false);
    });

    return () => ctrl.abort();
  }, [date, meeting, checkingAccess]);

  const imageUrl = `${BASE}/${date}/${meeting}/${race}`;

  useEffect(() => { setImgState("loading"); }, [imageUrl]);

  function shiftDate(days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split("T")[0]);
  }

  if (checkingAccess) return null;

  return (
    <div className="p-4 md:p-6">
      <div className="mb-2">
        <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Sweden" }]} />
      </div>
      <div className="mb-6 mt-4">
        <h1 className="text-xl font-semibold tracking-tight">Sweden — Travsport</h1>
        <p className="mt-1 text-sm text-muted-foreground">Browse Swedish trotting photo finishes by date and race.</p>
      </div>

      {/* Controls */}
      <Card className="mb-6">
        <CardContent className="pt-5 pb-4 px-4">
          <div className="flex flex-wrap items-end gap-4">

            {/* Date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <div className="flex items-center gap-1">
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
              </div>
            </div>

            {/* Meeting */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Meeting</label>
              <div className="flex gap-1.5">
                {[1, 2, 3].map((m) => (
                  <Button
                    key={m}
                    variant={meeting === m ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMeeting(m)}
                    className="w-10"
                  >
                    {m}
                  </Button>
                ))}
              </div>
            </div>

            {/* Race */}
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-xs font-medium text-muted-foreground">
                Race {probing && <span className="text-slate-400">(probing...)</span>}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: MAX_RACES }, (_, i) => i + 1).map((r) => {
                  const exists = availableRaces.includes(r);
                  return (
                    <Button
                      key={r}
                      variant={race === r ? "default" : "outline"}
                      size="sm"
                      onClick={() => setRace(r)}
                      disabled={probing ? false : availableRaces.length > 0 && !exists}
                      className={`w-10 ${!probing && availableRaces.length > 0 && !exists ? "opacity-30" : ""}`}
                    >
                      {r}
                    </Button>
                  );
                })}
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Photo finish */}
      <Card>
        <CardContent className="p-4">
          <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-widest">
            Photo Finish — {date} · Meeting {meeting} · Race {race}
          </p>

          <div className="relative flex min-h-[200px] items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden">
            {imgState === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            )}

            {imgState === "error" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
                <ImageOff className="h-8 w-8" />
                <p className="text-sm">No photo finish available for this race.</p>
              </div>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={imageUrl}
              src={imageUrl}
              alt={`Photo finish ${date} M${meeting} R${race}`}
              className={`w-full rounded-lg transition-opacity ${imgState === "ok" ? "opacity-100" : "opacity-0"}`}
              onLoad={() => setImgState("ok")}
              onError={() => setImgState("error")}
            />
          </div>

          {imgState === "ok" && (
            <div className="mt-3 flex justify-end">
              <a
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-slate-900 dark:hover:text-slate-100 underline underline-offset-2"
              >
                Open full size ↗
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
