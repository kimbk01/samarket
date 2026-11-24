import { isPrivilegedAdminAuthority } from "@/lib/auth/admin-policy";

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
  /** Server-resolved CURRENT dual-read; when set, drives admin exemption/label */
  privilegedAdmin?: boolean;
  status?: string | null;
  phone_verified?: boolean | null;
  phone_verified_at?: string | null;
  phone_verification_method?: string | null;
  provider?: string | null;
  auth_provider?: string | null;
  member_status?: string | null;
  email?: string | null;
  /** 저장된 전화번호 — `undefined` = 모름(규칙 미적용), 문자열·null = 수동 회원 번호 규칙 적용 */
  phone?: string | null;
  /** 번호 「있음」만 아는 입력(토큰 클레임) */
  has_phone?: boolean | null;
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
    normalized === "email"
  ) {
    return normalized;
  }
  return normalized;
}

export type RequiredStoreConsentVersions = {
  termsVersion: string;
  privacyVersion: string;
  /**
   * Versions whose consent is still valid: the current version and the newer-than-baseline
   * 「notice」 revisions back to the latest 「reconsent」 version (`required_consent_versions`).
   * Missing = only the current version is valid.
   */
  acceptedTermsVersions?: readonly string[] | null;
  acceptedPrivacyVersions?: readonly string[] | null;
};

function isAcceptedConsentVersion(
  memberVersion: string | null | undefined,
  current: string,
  accepted: readonly string[] | null | undefined,
): boolean {
  const v = typeof memberVersion === "string" ? memberVersion.trim() : "";
  if (!v) return false;
  return v === current || Boolean(accepted?.includes(v));
}

/**
 * Consent complete when accepted_at set and versions are the required one or still-accepted ones.
 * required defaults to STORE_* (CMS unavailable / sync callers).
 * Prefer resolveRequiredConsentVersions() on server and pass CMS versions.
 */
export function hasStoreTermsConsent(
  profile: Pick<
    ProfileLike,
    "terms_accepted_at" | "terms_version" | "privacy_accepted_at" | "privacy_version"
  > | null | undefined,
  required?: RequiredStoreConsentVersions | null,
): boolean {
  const termsVersion = required?.termsVersion ?? STORE_TERMS_VERSION;
  const privacyVersion = required?.privacyVersion ?? STORE_PRIVACY_VERSION;
  return (
    Boolean(profile?.terms_accepted_at) &&
    Boolean(profile?.privacy_accepted_at) &&
    isAcceptedConsentVersion(profile?.terms_version, termsVersion, required?.acceptedTermsVersions) &&
    isAcceptedConsentVersion(profile?.privacy_version, privacyVersion, required?.acceptedPrivacyVersions)
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

export type VerifiedPhoneVerdictInput = Pick<
  ProfileLike,
  | "phone_verified"
  | "phone_verified_at"
  | "phone_verification_method"
  | "provider"
  | "auth_provider"
  | "email"
  | "role"
  | "privilegedAdmin"
  | "phone"
  | "has_phone"
>;

/** 관리자 생성 회원인데 번호가 없다고 **확실히** 아는 경우 — 번호를 모르면 false(예전 판정 유지) */
function isAdminManualWithoutPhone(profile: VerifiedPhoneVerdictInput): boolean {
  if (!isAdminManualProvider(profile)) return false;
  if (typeof profile.has_phone === "boolean") return !profile.has_phone;
  if (profile.phone === undefined) return false;
  return !(typeof profile.phone === "string" && profile.phone.trim().length > 0);
}

/**
 * 전화 인증 판정 — **단일 구현** (가입 SSOT 2026-11-24). `hasVerifiedPhone`(제품 게이트)·`deriveStoreMemberStatus`(표시)가
 * 이 함수를 그대로 쓴다.
 * 1. 특권 관리자 → 인증
 * 2. 관리자 생성 회원인데 번호 없음 → 미인증 (Owner 2026-10-20 「관리자 수동 인증 = 전화번호 필수」)
 * 3. `phone_verified` 또는 `phone_verified_at` → 인증
 * 4. 관리자 생성 회원(번호 있음 또는 모름) → 인증 · `phone_verification_method` 라벨 단독은 근거 아님(PR #94 감사 #8)
 */
export function verifiedPhoneVerdict(profile: VerifiedPhoneVerdictInput): boolean {
  if (isPrivilegedAdminAuthority({ role: profile.role, privilegedAdmin: profile.privilegedAdmin })) {
    return true;
  }
  if (isAdminManualWithoutPhone(profile)) return false;
  if (profile.phone_verified === true) return true;
  const verifiedAt = typeof profile.phone_verified_at === "string" ? profile.phone_verified_at.trim() : "";
  if (verifiedAt) return true;
  return isAdminManualProvider(profile);
}

/** @deprecated 표시 전용 별칭 — 제품 게이트는 `hasVerifiedPhone` */
export function hasPhilippinePhoneVerification(profile: VerifiedPhoneVerdictInput): boolean {
  return verifiedPhoneVerdict(profile);
}

/**
 * 회원 상태 표시 — 판정은 `verifiedPhoneVerdict` 하나. `status`·`member_status` 저장값은 보지 않는다
 * (운영 2026-11-24: 저장값이 실제 인증과 15건 어긋남 — 인증했는데 「SNS 회원」 표시 등).
 */
export function deriveStoreMemberStatus(profile: ProfileLike | null | undefined): StoreMemberStatus {
  if (!profile || isDeletedStoreMember(profile)) return "guest";
  if (isPrivilegedAdminAuthority({ role: profile.role, privilegedAdmin: profile.privilegedAdmin })) {
    return "admin";
  }
  if (!verifiedPhoneVerdict(profile)) return "sns_member";
  return isAdminManualProvider(profile) ? "admin_manual" : "verified_member";
}

export function canUseStoreAction(profile: ProfileLike | null | undefined): boolean {
  const status = deriveStoreMemberStatus(profile);
  return status === "verified_member" || status === "admin_manual" || status === "admin";
}
