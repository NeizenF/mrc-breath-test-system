import { supabase } from "@/lib/supabase/client";

export async function isCurrentUserAdmin(): Promise<boolean> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.user?.id) {
    return false;
  }

  const { data, error } = await supabase
    .from("user_roles")
    .select("is_admin")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to check admin role:", error);
    return false;
  }

  return !!data?.is_admin;
}