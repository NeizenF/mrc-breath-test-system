"use client";

import { useEffect, useState } from "react";
import { normalizeName } from "@/lib/normalizeName";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Driver = {
  id: string;
  full_name: string;
  id_card: string | null;
  phone: string | null;
  created_at: string | null;
};

type HistoryRow = {
  entry_id: string;
  gate: number | null;
  horse_name: string | null;
  scratched: boolean;
  race_number: number;
  race_time: string | null;
  meeting_id: string;
  meeting_title: string | null;
  meeting_date: string | null;
  is_archived: boolean;
  result: "negative" | "positive" | null;
  tested_at: string | null;
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DriverProfilePage() {
  const params = useParams();
  const router = useRouter();
  const driverId = Array.isArray(params.id) ? params.id[0] : params.id ?? "";

  const [driver, setDriver] = useState<Driver | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        if (!session) { router.replace("/"); return; }

        const admin = await isCurrentUserAdmin();
        if (!mounted) return;
        if (!admin) { router.replace("/dashboard"); return; }

        setCheckingAccess(false);
        await loadProfile();
      } catch {
        router.replace("/dashboard");
      }
    }

    async function loadProfile() {
      if (!driverId) return;
      setLoading(true);

      const { data: driverData, error: driverError } = await supabase
        .from("drivers")
        .select("id,full_name,id_card,phone,created_at")
        .eq("id", driverId)
        .single();

      if (driverError || !driverData) {
        toast.error("Driver not found.");
        router.replace("/admin/drivers");
        return;
      }

      const entrySelect = `
        id,
        gate,
        horse_name,
        scratched,
        races (
          id,
          race_number,
          race_time,
          meetings (
            id,
            title,
            meeting_date,
            is_archived
          )
        )
      `;

      // Load entries linked by driver_id
      const { data: linkedData, error: entriesError } = await supabase
        .from("entries")
        .select(entrySelect)
        .eq("driver_id", driverId)
        .order("created_at", { ascending: false });

      if (entriesError) {
        toast.error(entriesError.message);
        setLoading(false);
        return;
      }

      // Also load entries matched by raw name (before the driver was in the DB)
      const normalizedDriverName = normalizeName(driverData.full_name);
      const { data: rawData } = await supabase
        .from("entries")
        .select(entrySelect)
        .is("driver_id", null)
        .not("driver_name_raw", "is", null);

      const rawMatches = (rawData || []).filter(
        (e: any) => normalizeName(e.driver_name_raw || "") === normalizedDriverName
      );

      // Merge, deduplicate by entry id
      const seenIds = new Set((linkedData || []).map((e: any) => e.id));
      const combined = [
        ...(linkedData || []),
        ...rawMatches.filter((e: any) => !seenIds.has(e.id)),
      ];

      const entries = combined as any[];
      const entryIds = entries.map((e) => e.id);

      let testMap = new Map<string, { result: "negative" | "positive" | null; tested_at: string | null }>();

      if (entryIds.length > 0) {
        const { data: testsData, error: testsError } = await supabase
          .from("tests")
          .select("entry_id,result,tested_at")
          .in("entry_id", entryIds);

        if (testsError) {
          toast.error(testsError.message);
        } else {
          for (const t of testsData || []) {
            testMap.set(t.entry_id, { result: t.result, tested_at: t.tested_at });
          }
        }
      }

      const rows: HistoryRow[] = entries
        .filter((e) => e.races && e.races.meetings)
        .map((e) => {
          const race = e.races;
          const meeting = race.meetings;
          const test = testMap.get(e.id);
          return {
            entry_id: e.id,
            gate: e.gate,
            horse_name: e.horse_name,
            scratched: !!e.scratched,
            race_number: race.race_number,
            race_time: race.race_time,
            meeting_id: meeting.id,
            meeting_title: meeting.title,
            meeting_date: meeting.meeting_date,
            is_archived: !!meeting.is_archived,
            result: test?.result ?? null,
            tested_at: test?.tested_at ?? null,
          };
        })
        .sort((a, b) => {
          const da = a.meeting_date ?? "";
          const db = b.meeting_date ?? "";
          return db.localeCompare(da);
        });

      if (mounted) {
        setDriver(driverData as Driver);
        setHistory(rows);
        setLoading(false);
      }
    }

    init();
    return () => { mounted = false; };
  }, [driverId, router]);

  if (checkingAccess) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-6">
        <p className="text-sm text-muted-foreground">Checking access...</p>
      </div>
    );
  }

  const totalTests = history.filter((r) => r.result !== null).length;
  const positives = history.filter((r) => r.result === "positive").length;
  const negatives = history.filter((r) => r.result === "negative").length;
  const pending = history.filter((r) => r.result === null && !r.scratched).length;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => router.push("/admin/drivers")}>
            Back to Drivers
          </Button>
          <Button variant="outline" onClick={() => router.push("/admin")}>
            Admin
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <>
            <Card className="shadow-sm">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-2xl">{driver?.full_name}</CardTitle>
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <p>ID Card: {driver?.id_card || "—"}</p>
                      <p>Phone: {driver?.phone || "—"}</p>
                      <p>Added: {formatDate(driver?.created_at ?? null)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <div className="rounded-lg border bg-background px-4 py-3 text-center">
                      <div className="text-2xl font-bold">{history.length}</div>
                      <div className="text-xs text-muted-foreground">Entries</div>
                    </div>
                    <div className="rounded-lg border bg-background px-4 py-3 text-center">
                      <div className="text-2xl font-bold">{totalTests}</div>
                      <div className="text-xs text-muted-foreground">Tested</div>
                    </div>
                    {positives > 0 && (
                      <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 px-4 py-3 text-center">
                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">{positives}</div>
                        <div className="text-xs text-red-500 dark:text-red-400">Positive{positives > 1 ? "s" : ""}</div>
                      </div>
                    )}
                    {negatives > 0 && (
                      <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950 px-4 py-3 text-center">
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">{negatives}</div>
                        <div className="text-xs text-green-500 dark:text-green-400">Negative{negatives > 1 ? "s" : ""}</div>
                      </div>
                    )}
                    {pending > 0 && (
                      <div className="rounded-lg border bg-background px-4 py-3 text-center">
                        <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{pending}</div>
                        <div className="text-xs text-muted-foreground">Pending</div>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Race history</CardTitle>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No race history found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-4 font-medium">Meeting</th>
                          <th className="pb-2 pr-4 font-medium">Date</th>
                          <th className="pb-2 pr-4 font-medium">Race</th>
                          <th className="pb-2 pr-4 font-medium">Gate</th>
                          <th className="pb-2 pr-4 font-medium">Horse</th>
                          <th className="pb-2 pr-4 font-medium">Tested at</th>
                          <th className="pb-2 font-medium">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {history.map((row) => (
                          <tr key={row.entry_id} className="hover:bg-muted/40">
                            <td className="py-2 pr-4">
                              <button
                                className="text-left hover:underline"
                                onClick={() => router.push(`/meetings/${row.meeting_id}/raceday`)}
                              >
                                {row.meeting_title || "Untitled"}
                              </button>
                              {row.is_archived && (
                                <span className="ml-2 text-xs text-muted-foreground">(archived)</span>
                              )}
                            </td>
                            <td className="py-2 pr-4 text-muted-foreground">
                              {formatDate(row.meeting_date)}
                            </td>
                            <td className="py-2 pr-4">Race {row.race_number}</td>
                            <td className="py-2 pr-4">{row.gate ?? "—"}</td>
                            <td className="py-2 pr-4">{row.horse_name || "—"}</td>
                            <td className="py-2 pr-4 text-muted-foreground">
                              {row.scratched ? "—" : formatDateTime(row.tested_at)}
                            </td>
                            <td className="py-2">
                              {row.scratched ? (
                                <Badge variant="outline">Scratched</Badge>
                              ) : row.result === "positive" ? (
                                <Badge variant="destructive">Positive</Badge>
                              ) : row.result === "negative" ? (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 hover:bg-green-100">Negative</Badge>
                              ) : (
                                <Badge variant="outline" className="text-yellow-600 dark:text-yellow-400">Pending</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
