import { inferAdminAuthProviderFromSyntheticEmail } from "@/lib/admin-users/resolve-admin-auth-provider";
import { isDibaySyntheticAuthEmail } from "@/lib/auth/synthetic-auth-email";
import type {
  AdminAccountCategory,
  AdminAuthProvider,
  AdminUser,
  AdminUserStatusCategory,
} from "@/lib/types/admin-user";

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

export function publicIdFromParts(dibayId?: string | null, username?: string | null): string {
  const id = (dibayId ?? username ?? "").trim();
  return id ? `@${id}` : "";
}

export function publicIdForAdminUser(user: AdminUser): string {
  return publicIdFromParts(user.dibay_id, user.username);
}

export function publicIdForDetailUser(user: DetailUserLike): string {
  return publicIdFromParts(user.dibay_id, user.username);
}

export function displayNameForDetailUser(user: DetailUserLike): string {
  return (
    user.nickname?.trim() ||
    user.display_name?.trim() ||
    publicIdForDetailUser(user).replace(/^@/, "") ||
    "—"
  );
}

export function resolveAccountCategoryFromRole(
  role: string | null | undefined,
  memberType?: string | null,
): AdminAccountCategory {
  const r = normalizeAdminLiteToken(role);
  const mt = normalizeAdminLiteToken(memberType);
  if (r === "admin" || r === "master" || r === "super_admin" || r === "staff") return "admin";
  if (
    r === "owner" ||
    r === "store_owner" ||
    r === "merchant" ||
    r === "store_admin" ||
    r === "business_owner" ||
    mt === "owner" ||
    mt === "store_owner" ||
    mt === "merchant" ||
    mt === "store_admin" ||
    mt === "business_owner"
  ) {
    return "store_manager";
  }
  return "member";
}

export function roleCategoryForAdminUser(user: AdminUser): AdminAccountCategory {
  if (user.accountCategory === "admin" || user.accountCategory === "store_manager") return user.accountCategory;
  if (user.roleCategory === "admin" || user.roleCategory === "store_manager") return user.roleCategory;
  if (user.profileRole === "super_admin" || user.profileRole === "master" || user.memberType === "admin") {
    return "admin";
  }
  return "member";
}

export function statusCategoryForAdminUser(user: AdminUser): AdminUserStatusCategory {
  if (user.statusCategory) return user.statusCategory;
  if (user.moderationStatus === "suspended" || user.moderationStatus === "banned") return "suspended";
  if (user.phoneVerified !== true || normalizeAdminLiteToken(user.memberStatus) === "pending") {
    return "needs_review";
  }
  return "active";
}

export function statusCategoryForDetailUser(user: DetailUserLike): AdminUserStatusCategory {
  const status = normalizeAdminLiteToken(user.status);
  const memberStatus = normalizeAdminLiteToken(user.member_status);
  const phoneStatus = normalizeAdminLiteToken(user.phone_verification_status);
  const moderation = normalizeAdminLiteToken(user.moderation_status);

  if (status === "deleted" || status === "withdrawn" || status === "deactivated") return "deleted";
  if (
    status === "suspended" ||
    status === "banned" ||
    memberStatus === "suspended" ||
    memberStatus === "banned" ||
    moderation === "suspended" ||
    moderation === "banned"
  ) {
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

export function roleRowClass(role: AdminAccountCategory): string {
  if (role === "admin") return "bg-[#f9f5ff] hover:bg-[#f4ebff]";
  if (role === "store_manager") return "bg-[#fff6ed] hover:bg-[#ffead5]";
  return "bg-white hover:bg-[#f9fafb]";
}

export function roleBadgeClass(role: AdminAccountCategory): string {
  if (role === "admin") return "border-[#e9d7fe] bg-[#f9f5ff] text-[#6941c6]";
  if (role === "store_manager") return "border-[#fdead7] bg-[#fff6ed] text-[#c4320a]";
  return "border-[#abefc6] bg-[#ecfdf3] text-[#067647]";
}

export function statusBadgeClass(status: AdminUserStatusCategory): string {
  if (status === "active") return "border-[#abefc6] bg-[#ecfdf3] text-[#067647]";
  if (status === "needs_review") return "border-[#fdead7] bg-[#fff6ed] text-[#c4320a]";
  if (status === "suspended") return "border-[#fecdca] bg-[#fef3f2] text-[#b42318]";
  return "border-[#e4e7ec] bg-[#f9fafb] text-[#475467]";
}

export function formatAdminLiteDate(
  value: string | null | undefined,
  localeTag: string,
  emptyDash: string,
): string {
  if (!value) return emptyDash;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return emptyDash;
  const d = new Date(time);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return localeTag.startsWith("ko") ? `${y}.${m}.${day}` : d.toLocaleDateString(localeTag);
}

export function formatAdminLiteDateTime(
  value: string | null | undefined,
  localeTag: string,
  emptyDash: string,
): string {
  if (!value) return emptyDash;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return emptyDash;
  return new Date(time).toLocaleString(localeTag, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
