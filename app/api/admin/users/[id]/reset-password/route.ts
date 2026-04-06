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

// POST /api/admin/users/[id]/reset-password — send password reset email
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id: targetId } = await params;

  const { data: { user }, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(targetId);
  if (getUserError || !user?.email) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const { error } = await supabaseAdmin.auth.resetPasswordForEmail(user.email);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, email: user.email });
}
