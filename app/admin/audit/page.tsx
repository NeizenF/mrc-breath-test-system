"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type AuditLog = {
  id: string;
  created_at: string;
  user_email: string | null;
  meeting_id: string | null;
  entry_id: string | null;
  action: string;
  driver_name: string | null;
  race_number: number | null;
  meetings?: { title: string | null; meeting_date: string | null }[] | null;
};

function formatAction(action: string) {
  if (action === "set_positive") return { label: "Positive", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" };
  if (action === "set_negative") return { label: "Negative", className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" };
  if (action === "cleared") return { label: "Cleared", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
  return { label: action, className: "bg-slate-100 text-slate-600" };
}

function formatTime(isoString: string) {
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDate(isoString: string) {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatMeetingLabel(log: AuditLog) {
  const m = Array.isArray(log.meetings) ? log.meetings[0] : log.meetings;
  if (!m) return null;
  const title = m.title?.trim();
  if (title) return title;
  if (m.meeting_date) {
    return new Date(m.meeting_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  return null;
}

const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "set_positive", label: "Positive" },
  { value: "set_negative", label: "Negative" },
  { value: "cleared", label: "Cleared" },
];

export default function AuditLogPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(true);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [meetingFilter, setMeetingFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        if (!session) { router.replace("/"); return; }

        const admin = await isCurrentUserAdmin();
        if (!mounted) return;
        if (!admin) { router.replace("/dashboard"); return; }

        setCheckingAccess(false);

        const { data, error } = await supabase
          .from("audit_logs")
          .select("id,created_at,user_email,meeting_id,entry_id,action,driver_name,race_number,meetings(title,meeting_date)")
          .order("created_at", { ascending: false })
          .limit(500);

        if (error) {
          console.error("Failed to load audit logs:", error);
        } else {
          setLogs((data as AuditLog[]) || []);
        }

        setLoading(false);
      } catch {
        router.replace("/dashboard");
      }
    }

    load();
    return () => { mounted = false; };
  }, [router]);

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (actionFilter && log.action !== actionFilter) return false;
      if (userFilter && !(log.user_email ?? "").toLowerCase().includes(userFilter.toLowerCase())) return false;
      if (meetingFilter) {
        const label = formatMeetingLabel(log) ?? "";
        if (!label.toLowerCase().includes(meetingFilter.toLowerCase())) return false;
      }
      if (dateFrom) {
        const logDate = log.created_at.slice(0, 10);
        if (logDate < dateFrom) return false;
      }
      if (dateTo) {
        const logDate = log.created_at.slice(0, 10);
        if (logDate > dateTo) return false;
      }
      return true;
    });
  }, [logs, actionFilter, userFilter, meetingFilter, dateFrom, dateTo]);

  const hasFilters = actionFilter || userFilter || meetingFilter || dateFrom || dateTo;

  function clearFilters() {
    setActionFilter("");
    setUserFilter("");
    setMeetingFilter("");
    setDateFrom("");
    setDateTo("");
  }

  // Group filtered logs by date
  const grouped = filtered.reduce<Record<string, AuditLog[]>>((acc, log) => {
    const dateKey = formatDate(log.created_at);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(log);
    return acc;
  }, {});

  const dateKeys = Object.keys(grouped);

  if (checkingAccess) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-7 w-36" />
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-2">
        <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Audit Log" }]} />
      </div>
      <div className="mb-6 mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Audit Log</h1>
          <p className="mt-1 text-sm text-muted-foreground">Test actions recorded during race days.</p>
        </div>
        {!loading && (
          <p className="shrink-0 text-sm text-muted-foreground pt-1">
            {filtered.length}{filtered.length !== logs.length ? ` of ${logs.length}` : ""} entries
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap gap-2">
          {ACTION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setActionFilter(opt.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                actionFilter === opt.value
                  ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:border-slate-100"
                  : "border-slate-200 dark:border-slate-700 text-muted-foreground hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Filter by user email..."
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="h-8 w-full max-w-[220px] text-sm"
          />
          <Input
            placeholder="Filter by meeting..."
            value={meetingFilter}
            onChange={(e) => setMeetingFilter(e.target.value)}
            className="h-8 w-full max-w-[200px] text-sm"
          />
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 w-auto text-sm"
            title="From date"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 w-auto text-sm"
            title="To date"
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1 text-xs">
              <X className="h-3 w-3" /> Clear
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {logs.length === 0 ? "No audit log entries yet." : "No entries match the current filters."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {dateKeys.map((dateKey) => (
            <div key={dateKey}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{dateKey}</p>
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {grouped[dateKey].map((log) => {
                      const { label, className } = formatAction(log.action);
                      const meetingLabel = formatMeetingLabel(log);
                      return (
                        <div key={log.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-mono text-xs text-muted-foreground w-20 shrink-0">{formatTime(log.created_at)}</span>
                            <span className="font-medium text-sm">{log.driver_name ?? "Unknown"}</span>
                            {log.race_number != null && (
                              <span className="text-xs text-muted-foreground">Race {log.race_number}</span>
                            )}
                            {meetingLabel && (
                              <span className="text-xs text-muted-foreground truncate max-w-[180px]">{meetingLabel}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{label}</span>
                            <span className="text-xs text-muted-foreground truncate max-w-[160px]">{log.user_email ?? "Unknown user"}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
