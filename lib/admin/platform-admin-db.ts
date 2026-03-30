import type { SupabaseClient } from "@supabase/supabase-js";
import { getAllowedAdminEmails } from "@/lib/auth/admin-policy";

/**
 * DB `is_platform_admin` + 운영용 `NEXT_PUBLIC_ADMIN_ALLOWED_EMAIL` (Auth 이메일).
 * 서비스 롤 클라이언트에서만 `auth.admin` 호출을 시도합니다.
 */
export async function isUserPlatformAdminDb(sb: SupabaseClient<any>, userId: string): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;

  const { data: tu } = await sb.from("test_users").select("role").eq("id", uid).maybeSingle();
  const tr = (tu as { role?: string } | null)?.role;
  if (tr === "admin" || tr === "master") return true;

  const { data: prof } = await sb.from("profiles").select("role").eq("id", uid).maybeSingle();
  const pr = (prof as { role?: string } | null)?.role;
  if (pr === "admin" || pr === "master") return true;

  const allow = getAllowedAdminEmails();
  if (allow.length === 0) return false;

  try {
    const { data, error } = await sb.auth.admin.getUserById(uid);
    const authEmail = data?.user?.email?.trim();
    if (!error && authEmail && allow.includes(authEmail)) return true;
  } catch {
    /* auth.admin 미지원·키 없음 등 */
  }

  return false;
}
