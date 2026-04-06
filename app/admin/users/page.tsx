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

type User = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
};

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

        if (mounted) setUsers(json.users);
        setLoading(false);
      } catch {
        router.replace("/dashboard");
      }
    }

    load();
    return () => { mounted = false; };
  }, [router]);

  async function toggleAdmin(user: User) {
    const token = await getToken();
    if (!token) return;

    setTogglingId(user.id);
    const next = !user.is_admin;

    const res = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_admin: next }),
    });
    const json = await res.json();

    if (!res.ok) {
      toast.error(json.error || "Failed to update user.");
    } else {
      setUsers((prev) => prev.map((u) => u.id === user.id ? { ...u, is_admin: next } : u));
      toast.success(next ? `${user.email} is now an admin.` : `${user.email} is no longer an admin.`);
    }
    setTogglingId(null);
  }

  async function doDelete(userId: string) {
    const token = await getToken();
    if (!token) return;

    setConfirmDeleteId(null);
    setDeletingId(userId);

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();

    if (!res.ok) {
      toast.error(json.error || "Failed to delete user.");
    } else {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success("User deleted.");
    }
    setDeletingId(null);
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return;
    const token = await getToken();
    if (!token) return;

    setInviting(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: inviteEmail }),
    });
    const json = await res.json();

    if (!res.ok) {
      toast.error(json.error || "Failed to send invite.");
    } else {
      toast.success(`Invite sent to ${inviteEmail}.`);
      setInviteEmail("");
      // Reload users list
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
          <p className="mt-2 text-xs text-muted-foreground">They'll receive an email to set their password.</p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Admins */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Admins</p>
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {admins.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      isSelf={user.id === currentUserId}
                      toggling={togglingId === user.id}
                      deleting={deletingId === user.id}
                      onToggleAdmin={() => toggleAdmin(user)}
                      onDelete={() => setConfirmDeleteId(user.id)}
                    />
                  ))}
                  {admins.length === 0 && (
                    <p className="px-4 py-3 text-sm text-muted-foreground">No admins.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Regular users */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Users</p>
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {others.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      isSelf={user.id === currentUserId}
                      toggling={togglingId === user.id}
                      deleting={deletingId === user.id}
                      onToggleAdmin={() => toggleAdmin(user)}
                      onDelete={() => setConfirmDeleteId(user.id)}
                    />
                  ))}
                  {others.length === 0 && (
                    <p className="px-4 py-3 text-sm text-muted-foreground">No other users.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
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

function UserRow({
  user,
  isSelf,
  toggling,
  deleting,
  onToggleAdmin,
  onDelete,
}: {
  user: User;
  isSelf: boolean;
  toggling: boolean;
  deleting: boolean;
  onToggleAdmin: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{user.email ?? "Unknown"}</span>
          {isSelf && (
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-muted-foreground">You</span>
          )}
          {user.is_admin && (
            <span className="rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 text-xs font-medium">Admin</span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Joined {formatDate(user.created_at)} · Last sign in {formatDate(user.last_sign_in_at)}
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={toggling || isSelf}
          onClick={onToggleAdmin}
        >
          {toggling ? "Saving..." : user.is_admin ? "Remove Admin" : "Make Admin"}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={deleting || isSelf}
          onClick={onDelete}
        >
          {deleting ? "Deleting..." : "Delete"}
        </Button>
      </div>
    </div>
  );
}
