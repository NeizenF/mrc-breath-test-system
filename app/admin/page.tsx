"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkAccess() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (!session) {
          router.replace("/");
          return;
        }

        const admin = await isCurrentUserAdmin();

        if (!mounted) return;

        if (!admin) {
          router.replace("/dashboard");
          return;
        }

        setLoading(false);
      } catch (error) {
        console.error("Failed to check admin access:", error);
        router.replace("/dashboard");
      }
    }

    checkAccess();

    return () => {
      mounted = false;
    };
  }, [router]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="text-sm text-slate-500">Loading admin area...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Admin Panel
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Manage meetings, drivers, and archives.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">Meetings</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-5 text-sm text-slate-500">
                Create meetings, import races, and manage race day data.
              </p>
              <Button
                className="w-full rounded-xl"
                onClick={() => router.push("/admin/meetings")}
              >
                Open Meetings
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">DriverInfo</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-5 text-sm text-slate-500">
                Manage the driver database and driver details.
              </p>
              <Button
                className="w-full rounded-xl"
                onClick={() => router.push("/admin/drivers")}
              >
                Open DriverInfo
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">Archive</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-5 text-sm text-slate-500">
                View archived meetings and restore them when needed.
              </p>
              <Button
                className="w-full rounded-xl"
                onClick={() => router.push("/admin/archive")}
              >
                Open Archive
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}