import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";

/**
 * trade-flow 등 관리자 API 공통 — `profiles.role` 기준.
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
  const { data: prof } = await db.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = (prof as { role?: string } | null)?.role;
  return isPrivilegedAdminRole(role);
}

/** 관리자 API용 — DB 역할만 신뢰한다. */
export async function verifyAdminAccess(
  url: string,
  anonKey: string,
  userId: string,
  sessionEmail?: string | null,
  serviceKey?: string | null
): Promise<boolean> {
  void sessionEmail;
  return verifyAdminUserId(url, anonKey, userId, serviceKey);
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
