"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ADMIN_PASSWORD = "change-this-now";

export default function AdminLoginPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (!session) {
          router.replace("/");
          return;
        }

        const hasAdminAccess =
          typeof window !== "undefined" &&
          sessionStorage.getItem("admin_access") === "true";

        if (hasAdminAccess) {
          router.replace("/admin");
          return;
        }

        setLoading(false);
      } catch (err) {
        console.error("Failed to check session:", err);
        router.replace("/");
      }
    }

    checkSession();

    return () => {
      mounted = false;
    };
  }, [router]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (password !== ADMIN_PASSWORD) {
        setError("Incorrect admin password.");
        setSubmitting(false);
        return;
      }

      sessionStorage.setItem("admin_access", "true");
      router.push("/admin");
    } catch (err) {
      console.error("Admin login failed:", err);
      setError("Could not verify admin password.");
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-900 px-4">
        <div className="text-sm text-slate-500">Loading...</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-900 px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            Admin Access
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Enter Admin Password
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            This area is protected separately from the main dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="admin-password"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Admin password
            </label>
            <Input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              autoFocus
            />
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl"
              onClick={() => router.push("/dashboard")}
            >
              Back
            </Button>

            <Button
              type="submit"
              className="w-full rounded-xl"
              disabled={submitting}
            >
              {submitting ? "Checking..." : "Continue"}
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}