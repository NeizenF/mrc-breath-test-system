import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function verifyAdmin(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("is_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  return data?.is_admin ? user.id : null;
}

// PATCH /api/admin/users/[id] — toggle admin or suspend/unsuspend
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const callerId = await verifyAdmin(req);
  if (!callerId) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id: targetId } = await params;
  const body = await req.json();

  if (callerId === targetId && body.is_admin === false) {
    return NextResponse.json({ error: "You cannot remove your own admin access." }, { status: 400 });
  }
  if (callerId === targetId && body.suspended === true) {
    return NextResponse.json({ error: "You cannot suspend your own account." }, { status: 400 });
  }

  if (typeof body.is_admin === "boolean") {
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: targetId, is_admin: body.is_admin }, { onConflict: "user_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (typeof body.suspended === "boolean") {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(targetId, {
      ban_duration: body.suspended ? "876600h" : "none",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/admin/users/[id] — delete a user account
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const callerId = await verifyAdmin(req);
  if (!callerId) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id: targetId } = await params;
  if (callerId === targetId) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(targetId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// POST /api/admin/users/[id]/reset is handled in /[id]/reset-password/route.ts
