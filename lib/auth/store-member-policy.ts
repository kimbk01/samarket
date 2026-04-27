import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";

export const STORE_TERMS_VERSION = "2026-04-store-review";
export const STORE_PRIVACY_VERSION = "2026-04-store-review";
export const STORE_PHONE_GATE_MESSAGE = "전화번호 인증 후 이용할 수 있습니다.";
export const DUPLICATE_LOGIN_MESSAGE = "동일 아이디가 다른 기기에서 접속 중입니다.";

export type StoreMemberStatus =
  | "guest"
  | "sns_member"
  | "verified_member"
  | "admin_manual"
  | "admin";

type ProfileLike = {
  role?: string | null;
  status?: string | null;
  phone_verified?: boolean | null;
  phone_verified_at?: string | null;
  provider?: string | null;
  auth_provider?: string | null;
  member_status?: string | null;
  email?: string | null;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  privacy_accepted_at?: string | null;
  privacy_version?: string | null;
  deleted_at?: string | null;
};

export function normalizeStoreAuthProvider(provider: string | null | undefined): string | null {
  const normalized = String(provider ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "custom:naver") return "naver";
  if (
    normalized === "manual" ||
    normalized === "manual_admin" ||
    normalized === "manual_admin_backfill" ||
    normalized === "admin_manual"
  ) {
    return "admin_manual";
  }
  if (normalized === "sync_from_auth") return "email";
  if (
    normalized === "google" ||
    normalized === "kakao" ||
    normalized === "naver" ||
    normalized === "apple" ||
    normalized === "facebook" ||
    normalized === "email"
  ) {
    return normalized;
  }
  return normalized;
}

export function hasStoreTermsConsent(
  profile: Pick<
    ProfileLike,
    "terms_accepted_at" | "terms_version" | "privacy_accepted_at" | "privacy_version"
  > | null | undefined
): boolean {
  return (
    Boolean(profile?.terms_accepted_at) &&
    Boolean(profile?.privacy_accepted_at) &&
    profile?.terms_version === STORE_TERMS_VERSION &&
    profile?.privacy_version === STORE_PRIVACY_VERSION
  );
}

export function isDeletedStoreMember(profile: Pick<ProfileLike, "deleted_at" | "status"> | null | undefined): boolean {
  return Boolean(profile?.deleted_at) || String(profile?.status ?? "").trim().toLowerCase() === "deleted";
}

export function isAdminManualProvider(input: Pick<ProfileLike, "provider" | "auth_provider" | "email">): boolean {
  const provider = normalizeStoreAuthProvider(input.provider ?? input.auth_provider);
  if (provider === "admin_manual") return true;
  return String(input.email ?? "")
    .trim()
    .toLowerCase()
    .endsWith("@manual.local");
}

export function hasPhilippinePhoneVerification(
  profile: Pick<ProfileLike, "phone_verified" | "phone_verified_at" | "provider" | "auth_provider" | "email" | "role">
): boolean {
  if (isPrivilegedAdminRole(profile.role)) return true;
  if (profile.phone_verified === true || Boolean(profile.phone_verified_at)) return true;
  return isAdminManualProvider(profile);
}

export function deriveStoreMemberStatus(profile: ProfileLike | null | undefined): StoreMemberStatus {
  if (!profile || isDeletedStoreMember(profile)) return "guest";
  if (isPrivilegedAdminRole(profile.role)) return "admin";
  const memberStatus = String(profile.member_status ?? "").trim().toLowerCase();
  if (memberStatus === "active") return "verified_member";
  if (memberStatus === "pending") return "sns_member";
  if (memberStatus === "admin_manual") return "admin_manual";
  if (memberStatus === "verified_member") return "verified_member";
  if (memberStatus === "sns_member") return "sns_member";
  if (isAdminManualProvider(profile)) return "admin_manual";
  return hasPhilippinePhoneVerification(profile) ? "verified_member" : "sns_member";
}

export function canUseStoreAction(profile: ProfileLike | null | undefined): boolean {
  const status = deriveStoreMemberStatus(profile);
  return status === "verified_member" || status === "admin_manual" || status === "admin";
}
