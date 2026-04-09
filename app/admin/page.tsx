"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import {
  CalendarDays, Users, ArchiveIcon, CalendarRange,
  ClipboardList, UserCog, Printer, Flag, UserCheck, Activity,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

type Stats = {
  upcomingMeetings: number;
  totalDrivers: number;
  recentTests: number;
  totalUsers: number;
};

const GROUPS = [
  {
    label: "Race Day",
    items: [
      {
        href: "/admin/meetings",
        icon: CalendarDays,
        title: "Meetings",
        description: "Create meetings, import races, manage race day data.",
        color: "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400",
      },
      {
        href: "/admin/prints",
        icon: Printer,
        title: "Prints",
        description: "Print checklists and declaration letters.",
        color: "bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400",
      },
    ],
  },
  {
    label: "People",
    items: [
      {
        href: "/admin/drivers",
        icon: Flag,
        title: "Drivers",
        description: "Manage the driver database and contact details.",
        color: "bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400",
      },
      {
        href: "/admin/users",
        icon: UserCog,
        title: "Users",
        description: "Manage user access and invite new members.",
        color: "bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400",
      },
    ],
  },
  {
    label: "Records",
    items: [
      {
        href: "/admin/audit",
        icon: ClipboardList,
        title: "Audit Log",
        description: "View all test actions recorded during race days.",
        color: "bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400",
      },
      {
        href: "/admin/calendar",
        icon: CalendarRange,
        title: "Calendar",
        description: "View and manage the race schedule.",
        color: "bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400",
      },
      {
        href: "/admin/archive",
        icon: ArchiveIcon,
        title: "Archive",
        description: "View and restore archived meetings.",
        color: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
      },
    ],
  },
];

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        if (!session) { router.replace("/"); return; }

        const admin = await isCurrentUserAdmin();
        if (!mounted) return;
        if (!admin) { router.replace("/dashboard"); return; }

        setLoading(false);
        loadStats();
      } catch {
        router.replace("/dashboard");
      }
    }

    async function loadStats() {
      const today = new Date().toISOString().slice(0, 10);

      const [meetingsRes, driversRes, testsRes] = await Promise.all([
        supabase.from("meetings").select("id", { count: "exact", head: true })
          .eq("is_archived", false).gte("meeting_date", today),
        supabase.from("drivers").select("id", { count: "exact", head: true }),
        supabase.from("audit_logs").select("id", { count: "exact", head: true })
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      if (!mounted) return;
      setStats({
        upcomingMeetings: meetingsRes.count ?? 0,
        totalDrivers: driversRes.count ?? 0,
        recentTests: testsRes.count ?? 0,
        totalUsers: 0,
      });
    }

    checkAccess();
    return () => { mounted = false; };
  }, [router]);

  const statCards = [
    { icon: CalendarDays, label: "Upcoming meetings", value: stats?.upcomingMeetings ?? 0, color: "text-emerald-600 dark:text-emerald-400" },
    { icon: UserCheck, label: "Total drivers", value: stats?.totalDrivers ?? 0, color: "text-violet-600 dark:text-violet-400" },
    { icon: Activity, label: "Tests this week", value: stats?.recentTests ?? 0, color: "text-rose-600 dark:text-rose-400" },
    { icon: Users, label: "System users", value: stats?.totalUsers ?? 0, color: "text-indigo-600 dark:text-indigo-400" },
  ];

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">

        {/* Header */}
        <div className="mb-8">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Admin Panel</h1>
              <p className="mt-1 text-sm text-muted-foreground">Manage meetings, drivers, and system settings.</p>
            </>
          )}
        </div>

        {/* Stats bar */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {loading
            ? [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)
            : statCards.map(({ icon: Icon, label, value, color }) => (
              <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-4 shadow-sm">
                <Icon className={`h-4 w-4 mb-2 ${color}`} />
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
                <div className="mt-0.5 text-xs text-muted-foreground leading-tight">{label}</div>
              </div>
            ))
          }
        </div>

        {/* Groups */}
        <div className="space-y-7">
          {loading
            ? [1, 2, 3].map((i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Skeleton className="h-24 rounded-2xl" />
                    <Skeleton className="h-24 rounded-2xl" />
                  </div>
                </div>
              ))
            : GROUPS.map(({ label, items }) => (
                <div key={label}>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {items.map(({ href, icon: Icon, title, description, color }) => (
                      <button
                        key={href}
                        onClick={() => router.push(href)}
                        className="group flex w-full items-start gap-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-4 text-left shadow-sm transition hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md active:scale-[0.99]"
                      >
                        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color}`}>
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-slate-100">{title}</p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))
          }
        </div>

      </div>
    </main>
  );
}
