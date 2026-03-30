import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAllowedAdminEmails, isPrivilegedAdminRole } from "@/lib/auth/admin-policy";

/**
 * trade-flow 등 관리자 API 공통 — test_users.role / profiles.role
 */
export async function verifyAdminUserId(
  url: string,
  anonKey: string,
  userId: string
): Promise<boolean> {
  const anon = createClient(url, anonKey);
  const { data: testUser } = await anon
    .from("test_users")
    .select("id, username, role")
    .eq("id", userId)
    .maybeSingle();

  const tr = (testUser as { role?: string } | null)?.role;
  if (isPrivilegedAdminRole(tr)) return true;

  const { data: prof } = await anon.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = (prof as { role?: string } | null)?.role;
  return isPrivilegedAdminRole(role);
}

/**
 * 관리자 API용 — DB 역할 + `NEXT_PUBLIC_ADMIN_ALLOWED_EMAIL` 허용 이메일(세션).
 * RLS `is_platform_admin`은 이메일 목록을 모르므로, 앱·서비스롤 보조 판별과 맞추기 위함.
 */
export async function verifyAdminAccess(
  url: string,
  anonKey: string,
  userId: string,
  sessionEmail?: string | null
): Promise<boolean> {
  if (await verifyAdminUserId(url, anonKey, userId)) return true;
  const em = sessionEmail?.trim();
  if (em && getAllowedAdminEmails().includes(em)) return true;
  return false;
}

export function getServiceOrAnonClient(
  url: string,
  anonKey: string,
  serviceKey: string | undefined
): SupabaseClient {
  return serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : createClient(url, anonKey);
}
