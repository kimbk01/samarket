/**
 * Admin Member Control Center — additive role badges.
 * CONTRACT: Person identity is never overwritten by store/admin membership.
 * Store staff/employee badges are forbidden (no membership table).
 * profiles.role is not Admin authority.
 */

export const ADMIN_MEMBER_ROLE_BADGES = ["member", "store_owner", "admin", "super_admin"] as const;
export type AdminMemberRoleBadge = (typeof ADMIN_MEMBER_ROLE_BADGES)[number];

export type AdminMemberRelationFilter = "all" | "plain" | "store_owner" | "admin";

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

export function memberMatchesRelationFilter(
  badges: readonly AdminMemberRoleBadge[],
  filter: AdminMemberRelationFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "store_owner") return badges.includes("store_owner");
  if (filter === "admin") return badges.includes("admin") || badges.includes("super_admin");
  return !badges.includes("store_owner") && !badges.includes("admin") && !badges.includes("super_admin");
}

/** Query `role` param compat — not exclusive identity. */
export function parseAdminMemberRelationFilter(
  raw: string | null | undefined,
): AdminMemberRelationFilter | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return null;
  if (value === "all") return "all";
  if (value === "member" || value === "plain") return "plain";
  if (value === "store_manager" || value === "store_owner") return "store_owner";
  if (value === "admin") return "admin";
  return null;
}

export function countAdditiveRoleRelations(rows: readonly AdminMemberRoleBadge[][]): {
  total: number;
  plain: number;
  storeOwner: number;
  admin: number;
} {
  let plain = 0;
  let storeOwner = 0;
  let admin = 0;
  for (const badges of rows) {
    if (memberMatchesRelationFilter(badges, "plain")) plain += 1;
    if (memberMatchesRelationFilter(badges, "store_owner")) storeOwner += 1;
    if (memberMatchesRelationFilter(badges, "admin")) admin += 1;
  }
  return { total: rows.length, plain, storeOwner, admin };
}
