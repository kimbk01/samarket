import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAllowedAdminEmails, isPrivilegedAdminRole } from "@/lib/auth/admin-policy";

/**
 * trade-flow 등 관리자 API 공통 — test_users.role / profiles.role
 *
 * 운영에서는 `SUPABASE_SERVICE_ROLE_KEY`가 있으면 서비스 롤로 조회해 RLS·정책 차이로 인한
 * 오판·403 과다를 막고, `isRouteAdmin()` 과 동일한 DB 신뢰 경로를 쓴다.
 * 서비스 키가 없는 로컬 등에서만 anon 폴백.
 */
export async function verifyAdminUserId(
  url: string,
  anonKey: string,
  userId: string,
  serviceKey?: string | null
): Promise<boolean> {
  const db = getServiceOrAnonClient(url, anonKey, serviceKey ?? undefined);
  const { data: testUser } = await db
    .from("test_users")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  const tr = (testUser as { role?: string } | null)?.role;
  if (isPrivilegedAdminRole(tr)) return true;

  const { data: prof } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
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
  sessionEmail?: string | null,
  serviceKey?: string | null
): Promise<boolean> {
  if (await verifyAdminUserId(url, anonKey, userId, serviceKey)) return true;
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
