"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";

type User = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
  suspended: boolean;
  test_count: number;
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
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) + " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function actionLabel(action: string) {
  if (action === "set_positive") return { text: "Positive", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" };
  if (action === "set_negative") return { text: "Negative", cls: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" };
  return { text: "Cleared", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" };
}

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedActivity, setExpandedActivity] = useState<string | null>(null);
  const [activityMap, setActivityMap] = useState<Record<string, ActivityEntry[]>>({});
  const [loadingActivity, setLoadingActivity] = useState<string | null>(null);

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
        const res = await fetch("/api/admin/users", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        if (!res.ok) { toast.error(json.error || "Failed to load users"); return; }
        if (mounted) { setUsers(json.users); setLoading(false); }
      } catch { router.replace("/dashboard"); }
    }
    load();
    return () => { mounted = false; };
  }, [router]);

  async function toggleAdmin(user: User) {
    const token = await getToken(); if (!token) return;
    setTogglingId(user.id);
    const next = !user.is_admin;
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_admin: next }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || "Failed to update user."); }
    else {
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_admin: next } : u));
      toast.success(next ? `${user.email} is now an admin.` : `${user.email} is no longer an admin.`);
    }
    setTogglingId(null);
  }

  async function toggleSuspend(user: User) {
    const token = await getToken(); if (!token) return;
    setSuspendingId(user.id);
    const next = !user.suspended;
    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ suspended: next }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || "Failed to update user."); }
    else {
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, suspended: next } : u));
      toast.success(next ? `${user.email} has been suspended.` : `${user.email} has been unsuspended.`);
    }
    setSuspendingId(null);
  }

  async function sendPasswordReset(user: User) {
    const token = await getToken(); if (!token) return;
    setResettingId(user.id);
    const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || "Failed to send reset email."); }
    else { toast.success(`Password reset email sent to ${user.email}.`); }
    setResettingId(null);
  }

  async function toggleActivity(userId: string) {
    if (expandedActivity === userId) { setExpandedActivity(null); return; }
    setExpandedActivity(userId);
    if (activityMap[userId]) return;
    setLoadingActivity(userId);
    const token = await getToken();
    const res = await fetch(`/api/admin/users/${userId}/activity`, {
      headers: { Authorization: `Bearer ${token ?? ""}` },
    });
    const json = await res.json();
    if (res.ok) setActivityMap((prev) => ({ ...prev, [userId]: json.activity }));
    setLoadingActivity(null);
  }

  async function doDelete(userId: string) {
    const token = await getToken(); if (!token) return;
    setConfirmDeleteId(null);
    setDeletingId(userId);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || "Failed to delete user."); }
    else { setUsers((prev) => prev.filter((u) => u.id !== userId)); toast.success("User deleted."); }
    setDeletingId(null);
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return;
    const token = await getToken(); if (!token) return;
    setInviting(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: inviteEmail }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || "Failed to send invite."); }
    else {
      toast.success(`Invite sent to ${inviteEmail}.`);
      setInviteEmail("");
      const res2 = await fetch("/api/admin/users", { headers: { Authorization: `Bearer ${token}` } });
      const json2 = await res2.json();
      if (res2.ok) setUsers(json2.users);
    }
    setInviting(false);
  }

  if (checkingAccess) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-7 w-36" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  const admins = users.filter((u) => u.is_admin);
  const others = users.filter((u) => !u.is_admin);

  return (
    <div className="p-4 md:p-6">
      <div className="mb-2">
        <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Users" }]} />
      </div>
      <div className="mb-6 mt-4">
        <h1 className="text-xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage access and invite new users.</p>
      </div>

      {/* Invite */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <p className="text-sm font-medium mb-2">Invite a new user</p>
          <div className="flex gap-2">
            <input
              type="email"
              placeholder="email@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendInvite()}
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button onClick={sendInvite} disabled={inviting || !inviteEmail.trim()}>
              {inviting ? "Sending..." : "Send Invite"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">They&apos;ll receive an email to set their password.</p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {[{ label: "Admins", list: admins }, { label: "Users", list: others }].map(({ label, list }) => (
            <div key={label}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
              <Card>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {list.map((user) => (
                      <div key={user.id}>
                        <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{user.email ?? "Unknown"}</span>
                              {user.id === currentUserId && (
                                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-muted-foreground">You</span>
                              )}
                              {user.is_admin && (
                                <span className="rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 text-xs font-medium">Admin</span>
                              )}
                              {user.suspended && (
                                <span className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 text-xs font-medium">Suspended</span>
                              )}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              Joined {formatDate(user.created_at)} · Last sign in {formatDate(user.last_sign_in_at)} · {user.test_count} test{user.test_count !== 1 ? "s" : ""} marked
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline" size="sm"
                              disabled={loadingActivity === user.id}
                              onClick={() => toggleActivity(user.id)}
                            >
                              Activity {expandedActivity === user.id ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
                            </Button>
                            <Button
                              variant="outline" size="sm"
                              disabled={resettingId === user.id}
                              onClick={() => sendPasswordReset(user)}
                            >
                              {resettingId === user.id ? "Sending..." : "Reset Password"}
                            </Button>
                            <Button
                              variant="outline" size="sm"
                              disabled={togglingId === user.id || user.id === currentUserId}
                              onClick={() => toggleAdmin(user)}
                            >
                              {togglingId === user.id ? "Saving..." : user.is_admin ? "Remove Admin" : "Make Admin"}
                            </Button>
                            <Button
                              variant="outline" size="sm"
                              disabled={suspendingId === user.id || user.id === currentUserId}
                              onClick={() => toggleSuspend(user)}
                            >
                              {suspendingId === user.id ? "Saving..." : user.suspended ? "Unsuspend" : "Suspend"}
                            </Button>
                            <Button
                              variant="destructive" size="sm"
                              disabled={deletingId === user.id || user.id === currentUserId}
                              onClick={() => setConfirmDeleteId(user.id)}
                            >
                              {deletingId === user.id ? "Deleting..." : "Delete"}
                            </Button>
                          </div>
                        </div>

                        {/* Activity panel */}
                        {expandedActivity === user.id && (
                          <div className="border-t bg-muted/30 px-4 py-3">
                            {loadingActivity === user.id ? (
                              <div className="space-y-2">
                                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full rounded" />)}
                              </div>
                            ) : !activityMap[user.id]?.length ? (
                              <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
                            ) : (
                              <div className="space-y-1">
                                {activityMap[user.id].map((entry) => {
                                  const { text, cls } = actionLabel(entry.action);
                                  const meeting = Array.isArray(entry.meetings) ? entry.meetings[0] : entry.meetings;
                                  const meetingTitle = meeting?.title?.trim() || (meeting?.meeting_date ? formatDate(meeting.meeting_date) : null);
                                  return (
                                    <div key={entry.id} className="flex flex-wrap items-center gap-2 text-xs">
                                      <span className="text-muted-foreground font-mono w-28 shrink-0">{formatDateTime(entry.created_at)}</span>
                                      <span className={`rounded-full px-2 py-0.5 font-medium ${cls}`}>{text}</span>
                                      <span className="font-medium">{entry.driver_name ?? "Unknown"}</span>
                                      {entry.race_number != null && <span className="text-muted-foreground">Race {entry.race_number}</span>}
                                      {meetingTitle && <span className="text-muted-foreground truncate">{meetingTitle}</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {list.length === 0 && (
                      <p className="px-4 py-3 text-sm text-muted-foreground">No {label.toLowerCase()} yet.</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete user?"
        description="This will permanently delete the user account. They will no longer be able to log in."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => confirmDeleteId && doDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
