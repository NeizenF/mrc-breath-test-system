"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { CalendarDays, Users, ArchiveIcon, ChevronRight, CalendarRange } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const CARDS = [
  {
    href: "/admin/meetings",
    icon: CalendarDays,
    title: "Meetings",
    description: "Create meetings, import races, and manage race day data.",
  },
  {
    href: "/admin/drivers",
    icon: Users,
    title: "DriverInfo",
    description: "Manage the driver database, contact details, and imports.",
  },
  {
    href: "/admin/archive",
    icon: ArchiveIcon,
    title: "Archive",
    description: "View archived meetings and restore them when needed.",
  },
  {
    href: "/admin/calendar",
    icon: CalendarRange,
    title: "Race Calendar",
    description: "View and manage the 2026 race schedule.",
  },
];

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

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
      } catch {
        router.replace("/dashboard");
      }
    }

    checkAccess();
    return () => { mounted = false; };
  }, [router]);

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">

        <div className="mb-8">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-7 w-36" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Admin Panel</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Manage meetings, drivers, and archives.
              </p>
            </>
          )}
        </div>

        <div className="space-y-3">
          {loading
            ? [1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)
            : CARDS.map(({ href, icon: Icon, title, description }) => (
                <button
                  key={href}
                  onClick={() => router.push(href)}
                  className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-4 text-left shadow-sm transition hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md active:scale-[0.99]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700">
                    <Icon className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">{title}</p>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400 truncate">{description}</p>
                  </div>

                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" />
                </button>
              ))}
        </div>

      </div>
    </main>
  );
}
