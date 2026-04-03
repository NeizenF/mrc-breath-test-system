"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

type Race = {
  id: string;
  race_number: number;
  race_time: string | null;
};

type Meeting = {
  meeting_date: string | null;
};

function parseRaceDateTime(meetingDate: string, raceTime: string): Date | null {
  const t = raceTime.trim();
  const m = t.match(/(\d{1,2})[:\.](\d{2})(?:\s*(am|pm))?/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const mer = m[3]?.toLowerCase();
  if (mer === "pm" && h !== 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  const d = new Date(`${meetingDate}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  d.setHours(h, min, 0, 0);
  return d;
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function ClockPage() {
  const params = useParams<{ id: string }>();
  const meetingId = params.id;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [races, setRaces] = useState<Race[]>([]);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function load() {
      const [{ data: m }, { data: r }] = await Promise.all([
        supabase.from("meetings").select("meeting_date").eq("id", meetingId).single(),
        supabase.from("races").select("id,race_number,race_time").eq("meeting_id", meetingId).order("race_number"),
      ]);
      if (m) setMeeting(m as Meeting);
      if (r) setRaces(r as Race[]);
    }
    load();
  }, [meetingId]);

  const nextRaceInfo = useMemo(() => {
    if (!meeting?.meeting_date || !races.length) return null;
    let fallback: { race: Race; diffMs: number } | null = null;
    for (const race of races) {
      if (!race.race_time) continue;
      const dt = parseRaceDateTime(meeting.meeting_date, race.race_time);
      if (!dt) continue;
      const diffMs = dt.getTime() - now.getTime();
      if (diffMs > 0) return { race, diffMs };
      if (!fallback || diffMs > fallback.diffMs) fallback = { race, diffMs };
    }
    return fallback;
  }, [now, races, meeting]);

  const isUrgent = nextRaceInfo && nextRaceInfo.diffMs > 0 && nextRaceInfo.diffMs < 6 * 60 * 1000;
  const isPast = nextRaceInfo && nextRaceInfo.diffMs < 0;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white gap-6 p-8">
      <div className="text-center space-y-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">
          {isPast ? "Last race" : "Next race"}
        </p>
        <p className="text-4xl font-extrabold text-slate-800">
          {nextRaceInfo ? `Race ${nextRaceInfo.race.race_number}` : "—"}
        </p>
        {nextRaceInfo?.race.race_time && (
          <p className="text-lg text-slate-500">{nextRaceInfo.race.race_time.trim()}</p>
        )}
      </div>

      <div
        style={{
          fontFamily: "'DSEG7-Classic', monospace",
          fontSize: "clamp(4rem, 15vw, 10rem)",
          letterSpacing: "0.05em",
          color: isPast ? "#94a3b8" : isUrgent ? "#dc2626" : "#1e293b",
          textShadow: isUrgent ? "0 0 20px rgba(220,38,38,0.4)" : "none",
          transition: "color 0.5s",
        }}
      >
        {nextRaceInfo ? formatCountdown(nextRaceInfo.diffMs) : "--:--"}
      </div>

      {isPast && (
        <p className="text-slate-400 text-sm">ago</p>
      )}
    </div>
  );
}
