"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";

type MeetingStat = {
  id: string;
  label: string;
  totalTested: number;
  positives: number;
};

type Summary = {
  totalMeetings: number;
  totalTested: number;
  totalPositives: number;
};

export default function SeasonDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary>({ totalMeetings: 0, totalTested: 0, totalPositives: 0 });
  const [meetingStats, setMeetingStats] = useState<MeetingStat[]>([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session) { router.replace("/"); return; }

      const admin = await isCurrentUserAdmin();
      if (!mounted) return;
      if (!admin) { router.replace("/dashboard"); return; }

      // Load meetings
      const { data: meetings } = await supabase
        .from("meetings")
        .select("id,title,meeting_date")
        .eq("is_archived", false)
        .order("meeting_date", { ascending: true });

      // Load tests that have been completed (tested = true) — this is the current state, not audit history
      const { data: tests } = await supabase
        .from("tests")
        .select("meeting_id,result")
        .eq("tested", true);

      if (!mounted) return;

      const meetingList = meetings ?? [];
      const testList = tests ?? [];

      // Aggregate per meeting
      const statsMap = new Map<string, { totalTested: number; positives: number }>();
      for (const t of testList) {
        if (!t.meeting_id) continue;
        const s = statsMap.get(t.meeting_id) ?? { totalTested: 0, positives: 0 };
        s.totalTested += 1;
        if (t.result === "positive") s.positives += 1;
        statsMap.set(t.meeting_id, s);
      }

      const stats: MeetingStat[] = meetingList.map((m) => {
        const s = statsMap.get(m.id) ?? { totalTested: 0, positives: 0 };
        const d = m.meeting_date
          ? new Date(m.meeting_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
          : "—";
        const label = m.title?.trim() || d;
        return { id: m.id, label, totalTested: s.totalTested, positives: s.positives };
      }).filter((s) => s.totalTested > 0);

      const totalTested = testList.length;
      const totalPositives = testList.filter((t) => t.result === "positive").length;

      setSummary({ totalMeetings: meetingList.length, totalTested, totalPositives });
      setMeetingStats(stats);
      setLoading(false);
    }

    load();
    return () => { mounted = false; };
  }, [router]);

  const positiveRate = summary.totalTested > 0
    ? ((summary.totalPositives / summary.totalTested) * 100).toFixed(1)
    : "0.0";

  const chartData = meetingStats.map((s) => ({
    name: s.label,
    Tested: s.totalTested,
    Positives: s.positives,
  }));

  const rateData = meetingStats.map((s) => ({
    name: s.label,
    "Positive %": s.totalTested > 0 ? parseFloat(((s.positives / s.totalTested) * 100).toFixed(1)) : 0,
  }));

  const summaryCards = [
    { label: "Active Meetings", value: loading ? "—" : summary.totalMeetings.toString(), color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Tests Conducted", value: loading ? "—" : summary.totalTested.toString(), color: "text-sky-600 dark:text-sky-400" },
    { label: "Positives", value: loading ? "—" : summary.totalPositives.toString(), color: "text-red-600 dark:text-red-400" },
    { label: "Positive Rate", value: loading ? "—" : `${positiveRate}%`, color: "text-amber-600 dark:text-amber-400" },
  ];

  return (
    <div className="p-4 md:p-6">
      <div className="mb-2">
        <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Season Dashboard" }]} />
      </div>
      <div className="mb-6 mt-4">
        <h1 className="text-xl font-semibold tracking-tight">Season Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Season-wide breath test statistics.</p>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map(({ label, value, color }) => (
          <Card key={label}>
            <CardContent className="py-5 px-5">
              {loading ? (
                <Skeleton className="h-8 w-16 mb-1" />
              ) : (
                <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : meetingStats.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No test data yet. Run some race days first.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Tests per meeting bar chart */}
          <Card>
            <CardContent className="pt-5 pb-4 px-4">
              <p className="mb-4 text-sm font-medium">Tests per Meeting</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 0, right: 8, left: -20, bottom: 40 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend verticalAlign="top" height={28} wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Tested" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Positives" fill="#f87171" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Positive rate trend line chart */}
          {rateData.length > 1 && (
            <Card>
              <CardContent className="pt-5 pb-4 px-4">
                <p className="mb-4 text-sm font-medium">Positive Rate Trend (%)</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={rateData} margin={{ top: 0, right: 8, left: -20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, "auto"]} />
                    <Tooltip formatter={(v) => [`${v}%`, "Positive Rate"]} />
                    <Line
                      type="monotone"
                      dataKey="Positive %"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 4, fill: "#f59e0b" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
