import { inferAdminAuthProviderFromSyntheticEmail } from "@/lib/admin-users/resolve-admin-auth-provider";
import {
  adminMemberListDisplayName,
  adminMemberPublicIdAt,
} from "@/lib/admin-users/admin-member-identity";
import { isDibaySyntheticAuthEmail } from "@/lib/auth/synthetic-auth-email";
import type {
  AdminAccountCategory,
  AdminAuthProvider,
  AdminMemberRoleBadge,
  AdminUser,
  AdminUserStatusCategory,
} from "@/lib/types/admin-user";
import { resolveAdminMemberRoleBadges } from "@/lib/admin-users/member-role-badges";
import { formatAdminManilaDate, formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

type DetailUserLike = {
  dibay_id?: string | null;
  username?: string | null;
  nickname?: string | null;
  display_name?: string | null;
  status?: string | null;
  member_status?: string | null;
  phone_verification_status?: string;
  phone_verified?: boolean;
  moderation_status?: string;
  role: string;
  member_type?: string | null;
  email?: string | null;
};

export function normalizeAdminLiteToken(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Member ID column: @{dibay_id} only. username is login alias, never public ID. */
export function publicIdFromParts(dibayId?: string | null, _username?: string | null): string {
  return adminMemberPublicIdAt(dibayId);
}

export function publicIdForAdminUser(user: AdminUser): string {
  return adminMemberPublicIdAt(user.dibay_id);
}

export function publicIdForDetailUser(user: DetailUserLike): string {
  return adminMemberPublicIdAt(user.dibay_id);
}

export function displayNameForAdminUser(user: AdminUser): string {
  return adminMemberListDisplayName({
    displayName: user.displayName,
    nickname: user.nickname,
    email: user.email,
    username: user.username,
  });
}

export function displayNameForDetailUser(user: DetailUserLike): string {
  return adminMemberListDisplayName({
    display_name: user.display_name,
    nickname: user.nickname,
    email: user.email,
    username: user.username,
  });
}

export function roleBadgesForAdminUser(user: AdminUser): AdminMemberRoleBadge[] {
  if (Array.isArray(user.roleBadges) && user.roleBadges.length > 0) {
    return user.roleBadges;
  }
  const membershipRole = user.isSuperAdmin
    ? "super_admin"
    : user.hasAdminMembership
      ? "admin"
      : null;
  return resolveAdminMemberRoleBadges({
    hasStoreOwnership: (user.storeRelation?.count ?? 0) > 0,
    adminMembershipRole: membershipRole,
  });
}

/** Row tint only — not Person identity SSOT. */
export function roleCategoryForAdminUser(user: AdminUser): AdminAccountCategory {
  const badges = roleBadgesForAdminUser(user);
  if (badges.includes("admin") || badges.includes("super_admin")) return "admin";
  if (badges.includes("store_owner")) return "store_manager";
  return "member";
}

export function statusCategoryForAdminUser(user: AdminUser): AdminUserStatusCategory {
  if (user.statusCategory) return user.statusCategory;
  // BLOCKED ≠ SUSPENDED — never collapse blocked into suspended for list display.
  if (user.moderationStatus === "blocked" || user.moderationStatus === "banned") return "blocked";
  if (user.moderationStatus === "suspended") return "suspended";
  if (user.moderationStatus === "withdrawn") return "deleted";
  // Verification is an independent axis (R2 / OD-02) — do not fold into account state.
  const memberStatus = normalizeAdminLiteToken(user.memberStatus);
  if (memberStatus === "pending" || memberStatus === "review") return "needs_review";
  return "active";
}

export function statusCategoryForDetailUser(user: DetailUserLike): AdminUserStatusCategory {
  const status = normalizeAdminLiteToken(user.status);
  const memberStatus = normalizeAdminLiteToken(user.member_status);
  const phoneStatus = normalizeAdminLiteToken(user.phone_verification_status);
  const moderation = normalizeAdminLiteToken(user.moderation_status);

  if (status === "deleted" || status === "withdrawn" || status === "deactivated") return "deleted";
  if (status === "blocked" || status === "banned" || moderation === "blocked" || moderation === "banned") {
    return "blocked";
  }
  if (status === "suspended" || memberStatus === "suspended" || moderation === "suspended") {
    return "suspended";
  }
  if (
    user.phone_verified !== true ||
    memberStatus === "pending" ||
    memberStatus === "review" ||
    phoneStatus === "pending" ||
    phoneStatus === "rejected"
  ) {
    return "needs_review";
  }
  return "active";
}

export function resolveDetailAuthProvider(email: string | null | undefined): AdminAuthProvider {
  const synthetic = inferAdminAuthProviderFromSyntheticEmail(email);
  if (synthetic) return synthetic;
  const trimmed = email?.trim() ?? "";
  if (trimmed && !isDibaySyntheticAuthEmail(trimmed)) return "email";
  return "unknown";
}

/** No exclusive-type row tint. Status/relation badges carry meaning. */
export function roleRowClass(_role?: AdminAccountCategory): string {
  return "bg-sam-surface hover:bg-sam-surface-muted";
}

export function roleBadgeClass(role: AdminAccountCategory): string {
  if (role === "admin") return "border-sam-primary-border bg-sam-primary-soft text-sam-primary";
  if (role === "store_manager") return "border-sam-warning bg-sam-warning-soft text-sam-warning";
  return "border-sam-success bg-sam-success-soft text-sam-success";
}

export function memberRoleBadgeClass(badge: AdminMemberRoleBadge): string {
  if (badge === "super_admin") return "border-sam-primary bg-sam-primary-soft text-sam-primary font-semibold";
  if (badge === "admin") return "border-sam-primary-border bg-sam-primary-soft text-sam-primary";
  if (badge === "store_owner") return "border-sam-warning bg-sam-warning-soft text-sam-warning";
  return "border-sam-success bg-sam-success-soft text-sam-success";
}

export function statusBadgeClass(status: AdminUserStatusCategory): string {
  if (status === "active") return "border-sam-success bg-sam-success-soft text-sam-success";
  if (status === "needs_review") return "border-sam-warning bg-sam-warning-soft text-sam-warning";
  if (status === "suspended") return "border-sam-danger bg-sam-danger-soft text-sam-danger";
  if (status === "blocked") return "border-sam-danger bg-sam-danger-soft text-sam-danger font-semibold";
  return "border-sam-border bg-sam-surface-muted text-sam-muted";
}

export function formatAdminLiteDate(
  value: string | null | undefined,
  localeTag: string,
  emptyDash: string,
): string {
  // 설계 v4 §6 — PHT 「YYYY-MM-DD」. localeTag 는 호출부 호환용(숫자형 표기라 언어 차이 없음).
  void localeTag;
  if (!value) return emptyDash;
  if (!Number.isFinite(new Date(value).getTime())) return emptyDash;
  return formatAdminManilaDate(value);
}

export function formatAdminLiteDateTime(
  value: string | null | undefined,
  localeTag: string,
  emptyDash: string,
): string {
  // 설계 v4 §6 — PHT 「YYYY-MM-DD HH:mm」.
  void localeTag;
  if (!value) return emptyDash;
  if (!Number.isFinite(new Date(value).getTime())) return emptyDash;
  return formatAdminManilaDateTime(value);
}
