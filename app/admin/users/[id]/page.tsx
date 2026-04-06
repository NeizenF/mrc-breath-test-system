"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

type UserDetail = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
  suspended: boolean;
  test_count: number;
  negatives: number;
  positives: number;
  cleared: number;
};

type ActivityEntry = {
  id: string;
  created_at: string;
  action: string;
  driver_name: string | null;
  race_number: number | null;
  meetings?: { title: string | null; meeting_date: string | null }[] | null;
};

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) + " · " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function actionLabel(action: string) {
  if (action === "set_positive") return { text: "Positive", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" };
  if (action === "set_negative") return { text: "Negative", cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" };
  return { text: "Cleared", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
}

async function getToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export default function UserProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = params.id;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [user, setUser] = useState<UserDetail | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [togglingAdmin, setTogglingAdmin] = useState(false);
  const [togglingSuspend, setTogglingSuspend] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
        setCurrentUserId(session.user.id);
        setCheckingAccess(false);

        const token = session.access_token;
        const [res1, res2] = await Promise.all([
          fetch(`/api/admin/users/${userId}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/admin/users/${userId}/activity`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        if (!mounted) return;

        if (res1.ok) {
          const j = await res1.json();
          setUser(j.user);
        } else {
          toast.error("User not found.");
          router.replace("/admin/users");
          return;
        }

        if (res2.ok) {
          const j = await res2.json();
          setActivity(j.activity ?? []);
        }

        setLoading(false);
      } catch {
        router.replace("/dashboard");
      }
    }
    load();
    return () => { mounted = false; };
  }, [userId, router]);

  async function toggleAdmin() {
    if (!user) return;
    const token = await getToken(); if (!token) return;
    setTogglingAdmin(true);
    const next = !user.is_admin;
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_admin: next }),
    });
    const json = await res.json();
    if (!res.ok) toast.error(json.error || "Failed.");
    else { setUser((u) => u ? { ...u, is_admin: next } : u); toast.success(next ? "Admin access granted." : "Admin access removed."); }
    setTogglingAdmin(false);
  }

  async function toggleSuspend() {
    if (!user) return;
    const token = await getToken(); if (!token) return;
    setTogglingSuspend(true);
    const next = !user.suspended;
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ suspended: next }),
    });
    const json = await res.json();
    if (!res.ok) toast.error(json.error || "Failed.");
    else { setUser((u) => u ? { ...u, suspended: next } : u); toast.success(next ? "User suspended." : "User unsuspended."); }
    setTogglingSuspend(false);
  }

  async function resetPassword() {
    if (!user) return;
    const token = await getToken(); if (!token) return;
    setResetting(true);
    const res = await fetch(`/api/admin/users/${userId}/reset-password`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) toast.error(json.error || "Failed.");
    else toast.success(`Password reset email sent to ${user.email}.`);
    setResetting(false);
  }

  async function doDelete() {
    const token = await getToken(); if (!token) return;
    setConfirmDelete(false);
    setDeleting(true);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || "Failed."); setDeleting(false); }
    else { toast.success("User deleted."); router.replace("/admin/users"); }
  }

  const isSelf = currentUserId === userId;

  if (checkingAccess) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <div className="mb-2">
        <Breadcrumbs items={[
          { label: "Admin", href: "/admin" },
          { label: "Users", href: "/admin/users" },
          { label: loading ? "..." : (user?.email ?? "User") },
        ]} />
      </div>

      {loading ? (
        <div className="mt-6 space-y-4">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : !user ? null : (
        <div className="mt-6 space-y-6">

          {/* Profile header */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-lg font-semibold">{user.email ?? "Unknown"}</h1>
                    {isSelf && <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-muted-foreground">You</span>}
                    {user.is_admin && <span className="rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 text-xs font-medium">Admin</span>}
                    {user.suspended && <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 text-xs font-medium">Suspended</span>}
                  </div>
                  <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                    <p>Joined {formatDate(user.created_at)}</p>
                    <p>Last sign in {formatDate(user.last_sign_in_at)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled={resetting} onClick={resetPassword}>
                    {resetting ? "Sending..." : "Reset Password"}
                  </Button>
                  <Button variant="outline" size="sm" disabled={togglingAdmin || isSelf} onClick={toggleAdmin}>
                    {togglingAdmin ? "Saving..." : user.is_admin ? "Remove Admin" : "Make Admin"}
                  </Button>
                  <Button variant="outline" size="sm" disabled={togglingSuspend || isSelf} onClick={toggleSuspend}>
                    {togglingSuspend ? "Saving..." : user.suspended ? "Unsuspend" : "Suspend"}
                  </Button>
                  <Button variant="destructive" size="sm" disabled={deleting || isSelf} onClick={() => setConfirmDelete(true)}>
                    {deleting ? "Deleting..." : "Delete"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">Tests Marked</div>
              <div className="mt-1 text-2xl font-semibold">{user.test_count}</div>
            </div>
            <div className="rounded-xl border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950 p-3">
              <div className="text-xs text-green-600 dark:text-green-400">Negative</div>
              <div className="mt-1 text-2xl font-semibold text-green-700 dark:text-green-300">{user.negatives}</div>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950 p-3">
              <div className="text-xs text-red-600 dark:text-red-400">Positive</div>
              <div className="mt-1 text-2xl font-semibold text-red-700 dark:text-red-300">{user.positives}</div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">Cleared</div>
              <div className="mt-1 text-2xl font-semibold">{user.cleared}</div>
            </div>
          </div>

          {/* Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity Log</CardTitle>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
              ) : (
                <div className="divide-y">
                  {activity.map((entry) => {
                    const { text, cls } = actionLabel(entry.action);
                    const meeting = Array.isArray(entry.meetings) ? entry.meetings[0] : entry.meetings;
                    const meetingTitle = meeting?.title?.trim() || (meeting?.meeting_date
                      ? new Date(meeting.meeting_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                      : null);
                    return (
                      <div key={entry.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{text}</span>
                          <span className="text-sm font-medium">{entry.driver_name ?? "Unknown"}</span>
                          {entry.race_number != null && <span className="text-xs text-muted-foreground">Race {entry.race_number}</span>}
                          {meetingTitle && <span className="text-xs text-muted-foreground">{meetingTitle}</span>}
                        </div>
                        <span className="text-xs text-muted-foreground">{formatDateTime(entry.created_at)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete user?"
        description="This will permanently delete the account. They will no longer be able to log in."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
