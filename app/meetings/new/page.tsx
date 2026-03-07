"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function NewMeetingPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (session?.user) {
        setCheckingAuth(false);
      } else {
        router.replace("/login?redirectTo=/meetings/new");
      }
    }

    checkAuth();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    const cleanTitle = title.trim();

    const { data, error } = await supabase
      .from("meetings")
      .insert({
        title: cleanTitle || null,
        meeting_date: meetingDate || null,
      })
      .select("id")
      .single();

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    router.push(`/meetings/${data.id}`);
    router.refresh();
  }

  if (checkingAuth) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-sm text-slate-500">Checking login...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Create New Meeting</CardTitle>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium">Meeting title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Example: Meeting 11"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Meeting date</label>
                <Input
                  type="date"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Creating..." : "Create meeting"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/meetings")}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}