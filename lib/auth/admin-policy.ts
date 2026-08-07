/** 관리자 정책은 공개 env·클라이언트 저장값이 아니라 서버의 Admin Membership 기준으로만 판단한다. */

/** 관리자 라우트는 모든 환경에서 서버 검증을 강제한다. */
export function isAdminRequireAuthEnabled(): boolean {
  return true;
}

/** 레거시 호출부 호환용. 더 이상 공개 이메일 allow-list는 사용하지 않는다. */
export function getAllowedAdminEmails(): string[] {
  return [];
}

/**
 * 플랫폼 관리자 여부 — 테스트 유저 role=admin|master 또는 `NEXT_PUBLIC_ADMIN_ALLOWED_EMAIL`.
 * 매장 오너(내 `/api/me/stores` 건수)와 무관. 매장 관리자 메뉴는 `fetchMeHasOwnerStores` 등으로 판별.
 */
/** DB·sessionStorage 등 소스별 표기 차이 대응 (Admin / ADMIN / 공백) */
export function normalizeAdminRole(role: string | null | undefined): string {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (normalized === "master") return "super_admin";
  return normalized;
}

/** Role token classifier only — not Application allow/deny by itself. */
export function isPrivilegedAdminRole(role: string | null | undefined): boolean {
  const r = normalizeAdminRole(role);
  return r === "admin" || r === "super_admin";
}

/**
 * Sync product-gate exemption facts.
 * `privilegedAdmin` must already be resolved from active admin_memberships
 * (via `hasActiveAdminMembershipOrLegacyRole` / server snapshot).
 * DO NOT fall back to profiles.role or invent client-side membership queries.
 */
export type PrivilegedAdminAuthorityFacts = {
  role?: string | null;
  privilegedAdmin?: boolean;
};

export function isPrivilegedAdminAuthority(facts: PrivilegedAdminAuthorityFacts): boolean {
  if (typeof facts.privilegedAdmin === "boolean") return facts.privilegedAdmin;
  // No profiles.role fallback — unset privilegedAdmin means not admin for authorization.
  void facts.role;
  return false;
}

/**
 * Client/UI helper — does not treat profiles.role or is_admin mirror as allow.
 * Pass `privilegedAdmin` from a server-derived membership fact when available.
 */
export function isAdminUser(
  user: { role?: string | null; is_admin?: boolean | null; privilegedAdmin?: boolean | null } | null
): boolean {
  if (!user) return false;
  if (typeof user.privilegedAdmin === "boolean") {
    return user.privilegedAdmin;
  }
  // Dual-write mirror (is_admin / role) is not Application authority.
  void user.role;
  void user.is_admin;
  return false;
}
