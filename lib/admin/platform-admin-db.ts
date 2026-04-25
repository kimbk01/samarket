import type { SupabaseClient } from "@supabase/supabase-js";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";

/** DB `profiles.role` 기준 관리자 판정 */
export async function isUserPlatformAdminDb(sb: SupabaseClient<any>, userId: string): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;

  const { data: prof } = await sb.from("profiles").select("role").eq("id", uid).maybeSingle();
  const pr = (prof as { role?: string } | null)?.role;
  return isPrivilegedAdminRole(pr);
}
