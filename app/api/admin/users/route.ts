import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function verifyAdmin(req: NextRequest): Promise<boolean> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return false;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return false;
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  return !!data?.is_admin;
}

// GET /api/admin/users — list all users with admin status, suspend status, test count
export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const [
    { data: { users }, error: usersError },
    { data: roles },
    { data: auditEntries },
  ] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
    supabaseAdmin.from("user_roles").select("user_id,is_admin"),
    supabaseAdmin.from("audit_logs").select("user_id"),
  ]);

  if (usersError) return NextResponse.json({ error: usersError.message }, { status: 500 });

  const roleMap = new Map((roles || []).map((r) => [r.user_id, r.is_admin]));

  const countMap = new Map<string, number>();
  for (const entry of (auditEntries || [])) {
    if (entry.user_id) countMap.set(entry.user_id, (countMap.get(entry.user_id) ?? 0) + 1);
  }

  const now = new Date();
  const result = users.map((u) => ({
    id: u.id,
    email: u.email ?? null,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    is_admin: !!roleMap.get(u.id),
    suspended: u.banned_until ? new Date(u.banned_until) > now : false,
    test_count: countMap.get(u.id) ?? 0,
  }));

  return NextResponse.json({ users: result });
}

// POST /api/admin/users — invite a new user by email
export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { email } = await req.json();
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email.trim().toLowerCase());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ user: { id: data.user.id, email: data.user.email } });
}
