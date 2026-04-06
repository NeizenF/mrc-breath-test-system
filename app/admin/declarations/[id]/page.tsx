"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Printer } from "lucide-react";

type Meeting = {
  id: string;
  title: string | null;
  meeting_date: string | null;
};

type Race = {
  id: string;
  race_number: number;
  race_time: string | null;
  race_distance: string | null;
  race_class: string | null;
  race_name: string | null;
  qualifiers: number | null;
  qualifiers_next_stage: string | null;
};

type Entry = {
  id: string;
  race_id: string;
  gate: number | null;
  horse_name: string | null;
  driver_name_raw: string | null;
  scratched: boolean | null;
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

export default function DeclarationsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meetingId = params.id;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [races, setRaces] = useState<Race[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) { router.replace("/"); return; }
      const admin = await isCurrentUserAdmin();
      if (!admin) { router.replace("/dashboard"); return; }

      const [{ data: m }, { data: r }] = await Promise.all([
        supabase.from("meetings").select("id,title,meeting_date").eq("id", meetingId).single(),
        supabase.from("races").select("id,race_number,race_time,race_distance,race_class,race_name,qualifiers,qualifiers_next_stage").eq("meeting_id", meetingId).order("race_number"),
      ]);

      if (!m) { router.replace("/admin/meetings"); return; }

      setMeeting(m as Meeting);
      const raceList = (r as Race[]) || [];
      setRaces(raceList);

      if (raceList.length > 0) {
        const { data: e } = await supabase
          .from("entries")
          .select("id,race_id,gate,horse_name,driver_name_raw,scratched")
          .in("race_id", raceList.map((rc) => rc.id))
          .order("gate", { ascending: true });
        setEntries((e as Entry[]) || []);
      }

      setLoading(false);
    })();
  }, [meetingId, router]);

  const entriesByRace = races.reduce<Record<string, Entry[]>>((acc, race) => {
    acc[race.id] = entries.filter((e) => e.race_id === race.id);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-4xl space-y-6">

        <div className="print:hidden">
          <Breadcrumbs items={[
            { label: "Admin", href: "/admin" },
            { label: "Meetings", href: "/admin/meetings" },
            { label: "Declared Runners" },
          ]} />
        </div>

        {loading ? (
          <div className="space-y-6">
            <Skeleton className="h-8 w-64" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-6 w-32" />
                {[1, 2, 3, 4].map((j) => <Skeleton key={j} className="h-10 w-full rounded" />)}
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start justify-between print:block">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 print:text-3xl">
                  {meeting?.title || "Meeting"}
                </h1>
                <p className="mt-1 text-slate-500 dark:text-slate-400">
                  {formatDate(meeting?.meeting_date ?? null)}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-slate-700 dark:text-slate-300 print:text-base">
                  Declared Runners
                </p>
              </div>
              <Button
                variant="outline"
                className="flex items-center gap-2 print:hidden"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
            </div>

            {/* Races */}
            <div className="space-y-8">
              {races.map((race) => {
                const raceEntries = entriesByRace[race.id] || [];
                const active = raceEntries.filter((e) => !e.scratched);
                const scratched = raceEntries.filter((e) => e.scratched);

                return (
                  <div key={race.id} className="break-inside-avoid">
                    {/* Race header */}
                    <div className="mb-3 border-b-2 border-slate-800 dark:border-slate-300 pb-2 print:border-slate-900">
                      <div className="flex items-baseline justify-between gap-4">
                        <div>
                          <span className="text-lg font-extrabold text-slate-900 dark:text-slate-100">
                            Race {race.race_number}
                          </span>
                          {race.race_name && (
                            <span className="ml-3 text-base font-semibold text-slate-700 dark:text-slate-300">
                              {race.race_name}
                            </span>
                          )}
                        </div>
                        <div className="text-right text-sm text-slate-500 dark:text-slate-400">
                          {[race.race_time, race.race_distance, race.race_class].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {race.qualifiers && (
                        <p className="mt-0.5 text-sm font-medium text-amber-700 dark:text-amber-400">
                          🏆 Top {race.qualifiers} advance{race.qualifiers_next_stage ? ` to ${race.qualifiers_next_stage}` : ""}
                        </p>
                      )}
                    </div>

                    {/* Entries table */}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          <th className="pb-2 pr-4 w-10">Gate</th>
                          <th className="pb-2 pr-4">Horse</th>
                          <th className="pb-2">Driver</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-slate-200">
                        {active.map((entry) => (
                          <tr key={entry.id}>
                            <td className="py-2 pr-4 font-bold text-slate-700 dark:text-slate-300">{entry.gate ?? "—"}</td>
                            <td className="py-2 pr-4 font-medium text-slate-900 dark:text-slate-100">{entry.horse_name || "—"}</td>
                            <td className="py-2 text-slate-600 dark:text-slate-400">{entry.driver_name_raw || "—"}</td>
                          </tr>
                        ))}
                        {scratched.map((entry) => (
                          <tr key={entry.id} className="opacity-50">
                            <td className="py-2 pr-4 line-through text-slate-500">{entry.gate ?? "—"}</td>
                            <td className="py-2 pr-4 line-through text-slate-500">{entry.horse_name || "—"}</td>
                            <td className="py-2 line-through text-slate-500 italic">Scratched</td>
                          </tr>
                        ))}
                        {raceEntries.length === 0 && (
                          <tr>
                            <td colSpan={3} className="py-3 text-slate-400 italic">No entries yet</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>

            {/* Print footer */}
            <div className="hidden print:block mt-12 border-t pt-4 text-xs text-slate-400">
              MRC Breath Test System · Printed {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
