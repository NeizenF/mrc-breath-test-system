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

function formatTime(ms: number) {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const base = hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return ms < 0 ? `-${base}` : base;
}

export default function ClockPage() {
  const params = useParams<{ id: string }>();
  const meetingId = params.id;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [races, setRaces] = useState<Race[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [currentIndex, setCurrentIndex] = useState(0);

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

  const racesWithTime = useMemo(
    () => races.filter((r) => r.race_time),
    [races]
  );

  const safeIndex = Math.min(currentIndex, racesWithTime.length - 1);
  const currentRace = racesWithTime[safeIndex] ?? null;

  const diffMs = useMemo(() => {
    if (!currentRace?.race_time || !meeting?.meeting_date) return null;
    const dt = parseRaceDateTime(meeting.meeting_date, currentRace.race_time);
    if (!dt) return null;
    return dt.getTime() - now.getTime();
  }, [currentRace, meeting, now]);

  const isOverdue = diffMs !== null && diffMs < 0;
  const isUrgent = diffMs !== null && diffMs >= 0 && diffMs < 6 * 60 * 1000;
  const isLast = safeIndex >= racesWithTime.length - 1;

  const timeColor = isOverdue ? "#dc2626" : isUrgent ? "#dc2626" : "#1e293b";
  const glowColor = (isOverdue || isUrgent)
    ? "0 0 20px rgba(220,38,38,0.4)"
    : "none";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white gap-8 p-8 select-none">

      {/* Race label */}
      <div className="text-center space-y-1">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
          {isOverdue ? "Delayed" : "Next race"}
        </p>
        <p className="text-5xl font-extrabold text-slate-800">
          {currentRace ? `Race ${currentRace.race_number}` : "—"}
        </p>
        {currentRace?.race_time && (
          <p className="text-xl text-slate-400">{currentRace.race_time.trim()}</p>
        )}
      </div>

      {/* Countdown */}
      <div
        style={{
          fontFamily: "'DSEG7-Classic', monospace",
          fontSize: "clamp(4rem, 18vw, 11rem)",
          letterSpacing: "0.05em",
          color: timeColor,
          textShadow: glowColor,
          transition: "color 0.4s",
          minWidth: "6ch",
          textAlign: "center",
        }}
      >
        {diffMs !== null ? formatTime(diffMs) : "--:--"}
      </div>

      {/* Race started button */}
      {currentRace && !isLast && (
        <button
          onClick={() => setCurrentIndex((i) => i + 1)}
          className="rounded-2xl bg-slate-900 px-8 py-4 text-white font-bold text-lg hover:bg-slate-700 active:scale-95 transition-all"
        >
          Race {currentRace.race_number} Started → Race {racesWithTime[safeIndex + 1]?.race_number}
        </button>
      )}

      {currentRace && isLast && (
        <p className="text-slate-400 font-medium">Last race of the day</p>
      )}
    </div>
  );
}
