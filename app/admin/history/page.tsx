"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Dot,
} from "recharts";

// ── Data ──────────────────────────────────────────────────────────────────────

type Winner = {
  year: number;
  horse: string | null;
  driver: string | null;
  time: string | null;
  timeSecs: number | null;
  note: string | null;
};

const WINNERS: Winner[] = [
  { year: 1933, horse: null,                  driver: null,                  time: null,      timeSecs: null, note: null },
  { year: 1934, horse: "Frise Poulet",        driver: "G. Galea",            time: null,      timeSecs: null, note: null },
  { year: 1935, horse: "Edinburgh",           driver: "G. Zerafa",           time: null,      timeSecs: null, note: null },
  { year: 1936, horse: "Victoria",            driver: null,                  time: null,      timeSecs: null, note: null },
  { year: 1937, horse: "Frouville",           driver: null,                  time: null,      timeSecs: null, note: null },
  { year: 1938, horse: "Desie",               driver: null,                  time: null,      timeSecs: null, note: null },
  { year: 1939, horse: "Golo",                driver: "M. Zerafa",           time: null,      timeSecs: null, note: null },
  { year: 1940, horse: "Minute",              driver: null,                  time: null,      timeSecs: null, note: null },
  { year: 1947, horse: "Liban II",            driver: "M. Mifsud",           time: null,      timeSecs: null, note: null },
  { year: 1948, horse: "Le Glorioux",         driver: null,                  time: null,      timeSecs: null, note: null },
  { year: 1949, horse: "Simon De Pastre",     driver: null,                  time: null,      timeSecs: null, note: null },
  { year: 1950, horse: "Scout M",             driver: "J. Piccione",         time: null,      timeSecs: null, note: null },
  { year: 1951, horse: "Pourpoui De Pas II",  driver: "G. Zerafa",           time: null,      timeSecs: null, note: null },
  { year: 1952, horse: "Voe Soli",            driver: "J. Zerafa",           time: null,      timeSecs: null, note: null },
  { year: 1953, horse: "Voe Soli",            driver: "M. Zerafa",           time: null,      timeSecs: null, note: null },
  { year: 1954, horse: "Brigantello",         driver: null,                  time: null,      timeSecs: null, note: null },
  { year: 1955, horse: "Vicdocq M",           driver: "Philip Debono",       time: null,      timeSecs: null, note: null },
  { year: 1956, horse: "Legnone",             driver: "G. Zerafa",           time: null,      timeSecs: null, note: null },
  { year: 1957, horse: "Dahna",               driver: "J. Zerafa",           time: null,      timeSecs: null, note: null },
  { year: 1958, horse: "Gavarnie",            driver: "J. Galea",            time: null,      timeSecs: null, note: null },
  { year: 1959, horse: "Danuble III",         driver: "J. Galea",            time: null,      timeSecs: null, note: null },
  { year: 1960, horse: "Drakkar",             driver: "C. Ciantar",          time: null,      timeSecs: null, note: null },
  { year: 1961, horse: "Ismene II",           driver: "R. Seguna",           time: null,      timeSecs: null, note: null },
  { year: 1962, horse: "Ike Williams C",      driver: "Ralph Gialanze",      time: null,      timeSecs: null, note: null },
  { year: 1963, horse: "Ike Williams C",      driver: "Ralph Gialanze",      time: null,      timeSecs: null, note: null },
  { year: 1964, horse: "Cerano",              driver: "I. Polodano",         time: null,      timeSecs: null, note: null },
  { year: 1965, horse: "Ike Williams C",      driver: "Ralph Gialanze",      time: null,      timeSecs: null, note: null },
  { year: 1966, horse: "Ike Williams C",      driver: "Ralph Gialanze",      time: null,      timeSecs: null, note: null },
  { year: 1967, horse: "Mikado III",          driver: null,                  time: null,      timeSecs: null, note: null },
  { year: 1968, horse: "Ocean B",             driver: "P. Aquilina",         time: null,      timeSecs: null, note: null },
  { year: 1969, horse: "Tulean",              driver: "G. Demechere",        time: null,      timeSecs: null, note: null },
  { year: 1970, horse: "Tabellion",           driver: "Flaccomino",          time: null,      timeSecs: null, note: null },
  { year: 1971, horse: "Urus Du Padoueng",    driver: "F. Portelli",         time: null,      timeSecs: null, note: null },
  { year: 1972, horse: "Sam II",              driver: "Nicholas Farrugia",   time: null,      timeSecs: null, note: null },
  { year: 1973, horse: "Un Reve Royal",       driver: "Francis Cassar",      time: null,      timeSecs: null, note: null },
  { year: 1974, horse: "Urbain L",            driver: "Alfred Fenech",       time: null,      timeSecs: null, note: null },
  { year: 1975, horse: "Aprile",              driver: "Marcel Michel Valle", time: null,      timeSecs: null, note: null },
  { year: 1976, horse: "Alcyon III",          driver: "Michel Faucault",     time: null,      timeSecs: null, note: null },
  { year: 1977, horse: "Cristal III",         driver: "Joseph Cardona",      time: null,      timeSecs: null, note: null },
  { year: 1978, horse: "Douaire",             driver: "Anthony Briffa",      time: null,      timeSecs: null, note: null },
  { year: 1979, horse: "Espoir Des Marias",   driver: "John Cardona",        time: null,      timeSecs: null, note: null },
  { year: 1980, horse: "Gualito",             driver: "Charles Grima",       time: null,      timeSecs: null, note: null },
  { year: 1981, horse: "Elorn",               driver: "Tarcisio Darmanin",   time: null,      timeSecs: null, note: null },
  { year: 1982, horse: "Heros Du Cousneon",   driver: "Joseph Valletta",     time: null,      timeSecs: null, note: null },
  { year: 1983, horse: "Hector De Retz",      driver: "Francis Cassar",      time: null,      timeSecs: null, note: null },
  { year: 1984, horse: "Race Suspended",      driver: null,                  time: null,      timeSecs: null, note: null },
  { year: 1999, horse: "Uquito D'Orphee",     driver: "Raymond Clifton",     time: null,      timeSecs: null, note: null },
  { year: 2008, horse: "James De L'Iton",     driver: "Noel Baldacchino",    time: null,      timeSecs: null, note: null },
  { year: 2009, horse: "James De L'Iton",     driver: "Noel Baldacchino",    time: null,      timeSecs: null, note: null },
  { year: 2010, horse: "In Vitro Du Bourg",   driver: "Ivan Bilocca",        time: "1'15\"8", timeSecs: 75.8, note: null },
  { year: 2011, horse: "Kakisis",             driver: "Johan Axisa",         time: "1'17\"6", timeSecs: 77.6, note: null },
  { year: 2012, horse: "Mig Of The Wood",     driver: "Noel Baldacchino",    time: "1'15\"4", timeSecs: 75.4, note: null },
  { year: 2013, horse: "Nabab Du Chatelet",   driver: "Charles Camilleri",   time: "1'15\"9", timeSecs: 75.9, note: null },
  { year: 2014, horse: "Cloria Victis",       driver: "Charles Degiorgio",   time: "1'15\"8", timeSecs: 75.8, note: null },
  { year: 2015, horse: "Qui Sait",            driver: "Rodney Gatt",         time: "1'15\"2", timeSecs: 75.2, note: null },
  { year: 2016, horse: "Vejby Boom",          driver: "Carl Caruana",        time: "1'15\"7", timeSecs: 75.7, note: null },
  { year: 2017, horse: "Overtaker By Sib",    driver: "Marco Refalo",        time: "1'15\"6", timeSecs: 75.6, note: null },
  { year: 2018, horse: "Urgah Du Rib",        driver: "Charles Camilleri",   time: "1'15\"3", timeSecs: 75.3, note: null },
  { year: 2019, horse: "Up And Go",           driver: "Rodney Gatt",         time: "1'14\"5", timeSecs: 74.5, note: null },
  { year: 2020, horse: "Vivaldi Du Vivrot",   driver: "Anton Cassar",        time: "1'14\"8", timeSecs: 74.8, note: null },
  { year: 2021, horse: "Antoine Du Bourg",    driver: "Redent Magro",        time: "1'14\"6", timeSecs: 74.6, note: null },
  { year: 2022, horse: "Charming Soldier",    driver: "Paul Galea",          time: "1'13\"5", timeSecs: 73.5, note: "Record set in 2022" },
  { year: 2023, horse: "Crack Money",         driver: "Michael Ellul",       time: "1'13\"7", timeSecs: 73.7, note: null },
  { year: 2024, horse: "Dreamer Boy",         driver: "Charles Camilleri",   time: "1'13\"5", timeSecs: 73.5, note: "Record equalled (2022)" },
  { year: 2025, horse: "Dats So Cool",        driver: "Jesmar Gafa",         time: "1'13\"3", timeSecs: 73.3, note: "Record set in 2025" },
  { year: 2026, horse: "Hudo Du Ruel",        driver: "Rodney Gatt",         time: "1'11\"9", timeSecs: 71.9, note: "Record set in 2026" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function secsToLabel(s: number) {
  const mins  = Math.floor(s / 60);
  const whole = Math.floor(s % 60);
  const tenth = Math.round((s % 1) * 10);
  return `${mins}'${String(whole).padStart(2, "0")}"${tenth}`;
}

const chartData = WINNERS
  .filter((w) => w.timeSecs !== null)
  .map((w) => ({ year: w.year, time: w.timeSecs, label: w.time, horse: w.horse, driver: w.driver, record: !!w.note }));

const recordYears = chartData.filter((d) => d.record).map((d) => d.year);

// Custom dot — highlights record years
function CustomDot(props: { cx?: number; cy?: number; payload?: { record: boolean } }) {
  const { cx = 0, cy = 0, payload } = props;
  if (payload?.record) {
    return <Dot cx={cx} cy={cy} r={6} fill="#f59e0b" stroke="#fff" strokeWidth={2} />;
  }
  return <Dot cx={cx} cy={cy} r={4} fill="#38bdf8" stroke="#fff" strokeWidth={1.5} />;
}

// Custom tooltip
function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: typeof chartData[0] }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-900 dark:text-slate-100">{d.year}</p>
      <p className="text-slate-600 dark:text-slate-300">{d.horse}</p>
      <p className="text-slate-500 dark:text-slate-400">{d.driver}</p>
      <p className="mt-1 font-mono font-bold text-sky-600 dark:text-sky-400">{d.label}</p>
      {d.record && <p className="mt-0.5 text-amber-600 dark:text-amber-400 font-medium">★ Record</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session) { router.replace("/"); return; }
      const admin = await isCurrentUserAdmin();
      if (!mounted) return;
      if (!admin) { router.replace("/dashboard"); return; }
      setChecking(false);
    }
    init();
    return () => { mounted = false; };
  }, [router]);

  const currentRecord = WINNERS.findLast((w) => w.timeSecs !== null);
  const totalEditions = WINNERS.filter((w) => w.horse && w.horse !== "Race Suspended").length;
  const mostWins = (() => {
    const counts = new Map<string, number>();
    for (const w of WINNERS) {
      if (w.driver) counts.set(w.driver, (counts.get(w.driver) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? `${sorted[0][0]} (${sorted[0][1]})` : "—";
  })();

  if (checking) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-2">
        <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "History" }]} />
      </div>
      <div className="mb-6 mt-4">
        <h1 className="text-xl font-semibold tracking-tight">Tazza l-Kbira</h1>
        <p className="mt-1 text-sm text-muted-foreground">All-time winners of Malta's premier harness race, from 1933 to present.</p>
      </div>

      {/* Summary cards */}
      <div className="mb-6 flex flex-wrap gap-3">
        {[
          { label: "Total Editions",   value: totalEditions.toString(),             color: "text-emerald-600 dark:text-emerald-400" },
          { label: "First Edition",    value: "1933",                               color: "text-slate-700 dark:text-slate-200" },
          { label: "Current Record",   value: currentRecord?.time ?? "—",           color: "text-sky-600 dark:text-sky-400" },
          { label: "Record Holder",    value: currentRecord?.horse ?? "—",          color: "text-amber-600 dark:text-amber-400" },
          { label: "Most Wins",        value: mostWins,                             color: "text-violet-600 dark:text-violet-400" },
        ].map(({ label, value, color }) => (
          <Card key={label} className="flex-1 min-w-[150px]">
            <CardContent className="py-4 px-4">
              <p className={`text-xl font-bold leading-tight ${color}`}>{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Time progression chart */}
      <Card className="mb-6">
        <CardContent className="pt-5 pb-4 px-4">
          <div className="mb-1 flex items-start justify-between">
            <p className="text-sm font-medium">Winning Time Progression (2010 – 2026)</p>
            <p className="text-xs text-muted-foreground">Lower = faster &nbsp;·&nbsp; <span className="text-amber-500">●</span> Record</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 10, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis
                domain={[70, 79]}
                tickFormatter={secsToLabel}
                tick={{ fontSize: 10 }}
                width={54}
                reversed
              />
              <Tooltip content={<CustomTooltip />} />
              {recordYears.map((yr) => (
                <ReferenceLine key={yr} x={yr} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} />
              ))}
              <Line
                type="monotone"
                dataKey="time"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={<CustomDot />}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Winners table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-16">Year</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Horse</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {[...WINNERS].reverse().map((w) => {
                  const isSuspended = w.horse === "Race Suspended";
                  const isRecord = !!w.note;
                  return (
                    <tr
                      key={w.year}
                      className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                        isRecord ? "bg-amber-50/60 dark:bg-amber-950/20" : ""
                      } ${isSuspended ? "opacity-40" : ""}`}
                    >
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{w.year}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">
                        {w.horse ?? <span className="text-muted-foreground italic">Unknown</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                        {w.driver ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {w.time
                          ? <span className="font-mono text-sky-700 dark:text-sky-400 font-semibold">{w.time}</span>
                          : <span className="text-muted-foreground text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-2.5 hidden sm:table-cell">
                        {w.note && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                            ★ {w.note}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
