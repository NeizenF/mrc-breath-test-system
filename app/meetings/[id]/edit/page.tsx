"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Meeting = {
  id: string;
  title: string | null;
  meeting_date: string | null;
};

export default function EditMeetingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const meetingId = params.id;

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState("");

  useEffect(() => {
    let mounted = true;

    async function checkAccessAndLoadMeeting() {
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

        setCheckingAccess(false);

        const { data, error } = await supabase
          .from("meetings")
          .select("id,title,meeting_date")
          .eq("id", meetingId)
          .single();

        if (!mounted) return;

        if (error || !data) {
          alert(error?.message || "Meeting not found.");
          router.replace("/admin/meetings");
          return;
        }

        const meeting = data as Meeting;

        setTitle(meeting.title ?? "");
        setMeetingDate(meeting.meeting_date ?? "");
        setLoading(false);
      } catch (error) {
        console.error("Failed to check admin access or load meeting:", error);
        router.replace("/dashboard");
      }
    }

    checkAccessAndLoadMeeting();

    return () => {
      mounted = false;
    };
  }, [meetingId, router]);

  async function handleSave() {
    setSaving(true);

    const cleanTitle = title.trim();

    const { error } = await supabase
      .from("meetings")
      .update({
        title: cleanTitle.length > 0 ? cleanTitle : null,
        meeting_date: meetingDate || null,
      })
      .eq("id", meetingId);

    setSaving(false);

    if (error) {
      alert(error.message);
      return;
    }

    router.push("/admin/meetings");
    router.refresh();
  }

  if (checkingAccess) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-sm text-muted-foreground">
          Checking admin access...
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-sm text-muted-foreground">Loading meeting...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-4 md:p-6">
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Edit Meeting</CardTitle>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Meeting title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter meeting title"
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
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </Button>

              <Button
                variant="outline"
                onClick={() => router.push(`/meetings/${meetingId}`)}
              >
                Open meeting
              </Button>

              <Button
                variant="outline"
                onClick={() => router.push("/admin/meetings")}
              >
                Back to meetings
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}