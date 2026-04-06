"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { isCurrentUserAdmin } from "@/lib/isCurrentUserAdmin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";

type User = {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
  suspended: boolean;
  test_count: number;
};

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

async function getToken() {
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
                      <button
                        key={user.id}
                        onClick={() => router.push(`/admin/users/${user.id}`)}
                        className="group flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                      >
                        {/* Avatar initial */}
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-300">
                          {(user.email?.[0] ?? "?").toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium truncate">{user.email ?? "Unknown"}</span>
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
                            Last sign in {formatDate(user.last_sign_in_at)} · {user.test_count} test{user.test_count !== 1 ? "s" : ""} marked
                          </div>
                        </div>

                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" />
                      </button>
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
    </div>
  );
}
