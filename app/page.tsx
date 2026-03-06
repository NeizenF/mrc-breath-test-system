"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight">MRC System</h1>
          <p className="text-sm text-slate-500 mt-2">
            Malta Racing Club breathalyzer testing system
          </p>
        </div>

        <Card className="shadow-lg border-0 rounded-2xl">
          <CardHeader>
            <CardTitle className="text-xl">Log in</CardTitle>
          </CardHeader>

          <CardContent>

            {checkingSession && (
              <div className="mb-4 text-sm rounded-xl bg-slate-100 px-3 py-2 text-slate-600">
                Checking session...
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">

              <div>
                <label className="text-sm font-medium block mb-1">
                  Email
                </label>
                <input
                  type="email"
                  className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">
                  Password
                </label>
                <input
                  type="password"
                  className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-slate-300"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              {message && (
                <div className="text-sm rounded-xl bg-red-100 px-3 py-2 text-red-700">
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

          </CardContent>
        </Card>

      </div>
    </main>
  );
}