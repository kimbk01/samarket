/**
 * 관리자 정책 (보안·노출 판단)
 * - 허용 이메일/테스트 유저 기준 관리자 여부
 * - 실운영 시 env 또는 서버 세션으로 교체
 */

import { getTestAuth } from "@/lib/auth/test-auth-store";

/** `AdminGuard`·관리자 API(`isRouteAdmin`)와 동일 기준 */
export function isAdminRequireAuthEnabled(): boolean {
  return (
    typeof process.env.NEXT_PUBLIC_ADMIN_REQUIRE_AUTH === "string" &&
    process.env.NEXT_PUBLIC_ADMIN_REQUIRE_AUTH === "true"
  );
}

/** 허용 관리자 이메일: env 우선. 실운영 시 반드시 env 설정. */
export function getAllowedAdminEmails(): string[] {
  const v = process.env.NEXT_PUBLIC_ADMIN_ALLOWED_EMAIL;
  if (typeof v === "string" && v.trim())
    return v.split(",").map((e) => e.trim()).filter(Boolean);
  return [];
}

/**
 * 플랫폼 관리자 여부 — 테스트 유저 role=admin|master 또는 `NEXT_PUBLIC_ADMIN_ALLOWED_EMAIL`.
 * 매장 오너(내 `/api/me/stores` 건수)와 무관. 매장 관리자 메뉴는 `fetchMeHasOwnerStores` 등으로 판별.
 */
export function isAdminUser(
  user: { email?: string | null; id?: string } | null
): boolean {
  const test = getTestAuth();
  if (test && (test.role === "admin" || test.role === "master")) return true;
  if (!user?.email) return false;
  return getAllowedAdminEmails().includes(user.email);
}
