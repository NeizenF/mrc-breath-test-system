"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function LandingPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkUser() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (session) {
          router.replace("/dashboard");
          return;
        }
      } catch (err) {
        console.error("Session check failed:", err);
      } finally {
        if (mounted) setCheckingSession(false);
      }
    }

    checkUser();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      router.replace("/dashboard");
    } catch (err: any) {
      setMessage(err?.message || "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-900 px-4">
        <div className="text-sm text-slate-500">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-100 to-slate-200 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Image
            src="/mrc-logo.jpg"
            alt="MRC logo"
            width={64}
            height={64}
            className="rounded-2xl shadow-md"
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              MRC Breath Test System
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Malta Racing Club
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/70 dark:shadow-slate-900/70">
          <div className="px-8 py-8">
            <h2 className="mb-6 text-lg font-semibold text-slate-900 dark:text-slate-100">Log in</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Email
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              {message && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  {message}
                </div>
              )}

              <Button
                type="submit"
                className="w-full rounded-xl"
                disabled={submitting}
              >
                {submitting ? "Logging in..." : "Log in"}
              </Button>
            </form>
          </div>
        </div>

      </div>
    </main>
  );
}