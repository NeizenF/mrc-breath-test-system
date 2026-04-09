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
import { ClipboardList, CheckCircle, AlertCircle, RotateCcw, ShieldCheck, ShieldOff, Ban, Trash2 } from "lucide-react";

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

function getInitial(email: string | null) {
  return (email ?? "?")[0].toUpperCase();
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
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 dark:bg-indigo-950 text-xl font-bold text-indigo-700 dark:text-indigo-300">
              {getInitial(user.email)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {user.email ?? "Unknown"}
                </h1>
                {isSelf && <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-muted-foreground">You</span>}
                {user.is_admin && <span className="rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2.5 py-0.5 text-xs font-medium">Admin</span>}
                {user.suspended && <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 px-2.5 py-0.5 text-xs font-medium">Suspended</span>}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                <span>Joined {formatDate(user.created_at)}</span>
                <span>Last sign in {formatDate(user.last_sign_in_at)}</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: ClipboardList, label: "Tests Marked", value: user.test_count, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-950" },
              { icon: CheckCircle, label: "Negative", value: user.negatives, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950" },
              { icon: AlertCircle, label: "Positive", value: user.positives, color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50 dark:bg-rose-950" },
              { icon: RotateCcw, label: "Cleared", value: user.cleared, color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-100 dark:bg-slate-800" },
            ].map(({ icon: Icon, label, value, color, bg }) => (
              <div key={label} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm">
                <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-xl ${bg}`}>
                  <Icon className={`h-4 w-4 ${color}`} />
                </div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          {!isSelf && (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Actions</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={resetting} onClick={resetPassword} className="gap-2">
                  <RotateCcw className="h-3.5 w-3.5" />
                  {resetting ? "Sending..." : "Reset Password"}
                </Button>
                <Button variant="outline" size="sm" disabled={togglingAdmin} onClick={toggleAdmin} className="gap-2">
                  {user.is_admin ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  {togglingAdmin ? "Saving..." : user.is_admin ? "Remove Admin" : "Make Admin"}
                </Button>
                <Button variant="outline" size="sm" disabled={togglingSuspend} onClick={toggleSuspend} className="gap-2">
                  <Ban className="h-3.5 w-3.5" />
                  {togglingSuspend ? "Saving..." : user.suspended ? "Unsuspend" : "Suspend"}
                </Button>
                <Button variant="destructive" size="sm" disabled={deleting} onClick={() => setConfirmDelete(true)} className="gap-2">
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleting ? "Deleting..." : "Delete"}
                </Button>
              </div>
            </div>
          )}

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
