/**
 * Admin Member Control Center — additive role badges.
 * CONTRACT: Person identity is never overwritten by store/admin membership.
 * Store staff/employee badges are forbidden (no membership table).
 * profiles.role is not Admin authority.
 *
 * R2: collapsed "관계/회원 구분" filter axis is deleted.
 * List filtering uses orthogonal store + privilege plans
 * (`adminMemberStoreFilterPlan` / `adminMemberPrivilegeFilterPlan`).
 */

export const ADMIN_MEMBER_ROLE_BADGES = ["member", "store_owner", "admin", "super_admin"] as const;
export type AdminMemberRoleBadge = (typeof ADMIN_MEMBER_ROLE_BADGES)[number];

export type AdminMembershipRoleToken = "admin" | "super_admin";

export function resolveAdminMemberRoleBadges(input: {
  hasStoreOwnership: boolean;
  adminMembershipRole: AdminMembershipRoleToken | null;
}): AdminMemberRoleBadge[] {
  const badges: AdminMemberRoleBadge[] = ["member"];
  if (input.hasStoreOwnership) badges.push("store_owner");
  if (input.adminMembershipRole === "super_admin") {
    badges.push("super_admin");
  } else if (input.adminMembershipRole === "admin") {
    badges.push("admin");
  }
  return badges;
}

export function adminMembershipRoleFromRow(
  role: string | null | undefined,
): AdminMembershipRoleToken | null {
  const token = String(role ?? "").trim().toLowerCase();
  if (token === "super_admin" || token === "master") return "super_admin";
  if (token === "admin") return "admin";
  return null;
}

/** Additive overlap proof — store and admin axes do not overwrite each other. */
export function memberHasOrthogonalStoreAndPrivilege(
  badges: readonly AdminMemberRoleBadge[],
): boolean {
  const hasStore = badges.includes("store_owner");
  const hasPriv = badges.includes("admin") || badges.includes("super_admin");
  return hasStore && hasPriv;
}
