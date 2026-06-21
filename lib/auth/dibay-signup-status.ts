import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { isProfileSetupGateExcludedPath } from "@/lib/auth/profile-setup-flow";
import { hasStoreTermsConsent } from "@/lib/auth/store-member-policy";
import {
  sanitizeFreshLoginLandingPath,
  sanitizeNextPath,
  withNextSearchParam,
} from "@/lib/auth/safe-next-path";
import { isPrivilegedAdminRole } from "@/lib/auth/admin-policy";
import { isPublicIdSetupComplete } from "@/lib/auth/dibay-public-id-ssot";

export {
  evaluatePublicIdProfileView,
  isPublicIdSetupComplete,
  normalizeProfilePublicIdFields,
  profileFieldsForDibayIdComplete,
  resolvePublicIdAtDisplay,
  resolvePublicIdInputSeed,
  resolveSearchablePublicId,
  type ProfilePublicIdFields,
  type PublicIdProfileView,
} from "@/lib/auth/dibay-public-id-ssot";

export type DibayOnboardingStatusValue =
  | "pending"
  | "oauth_authenticated"
  | "terms_required"
  | "id_required"
  | "profile_ready"
  | "completed";

/**
 * DIBAY 가입 phase — SNS OAuth 직후 Supabase session ≠ signupComplete.
 * signupComplete = 약관 동의만 (법적 최소). @id·프로필·주소는 기능별 gate.
 * mutation API 는 requireSignupCompleteForUser 로 약관 미동의 403.
 * @see docs/auth-account-linking-policy.md
 */
export type DibaySignupPhase =
  | "pending_auth"
  | "oauth_authenticated"
  | "terms_required"
  | "id_required"
  | "profile_ready"
  | "completed";

export type DibaySignupProfileInput = {
  id?: string | null;
  dibay_id?: string | null;
  dibay_id_locked?: boolean | null;
  username?: string | null;
  username_confirmed?: boolean | null;
  display_name?: string | null;
  avatar_url?: string | null;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  privacy_accepted_at?: string | null;
  privacy_version?: string | null;
  onboarding_completed_at?: string | null;
  onboarding_status?: string | null;
  role?: string | null;
};

export type DibaySignupStatus = {
  phase: DibaySignupPhase;
  consentComplete: boolean;
  dibayIdComplete: boolean;
  profileComplete: boolean;
  legacyCompleted: boolean;
  signupComplete: boolean;
  onboardingStatus: DibayOnboardingStatusValue;
};

function pickTrimmed(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isDibayIdComplete(profile: DibaySignupProfileInput | null | undefined): boolean {
  return isPublicIdSetupComplete(profile);
}

export function isDibayProfileComplete(profile: DibaySignupProfileInput | null | undefined): boolean {
  if (!profile) return false;
  const displayName = pickTrimmed(profile.display_name);
  const avatarUrl = pickTrimmed(profile.avatar_url);
  return Boolean(displayName && avatarUrl);
}

export function deriveDibaySignupStatus(
  profile: DibaySignupProfileInput | null | undefined,
  opts?: { hasSession?: boolean }
): DibaySignupStatus {
  const hasSession = opts?.hasSession !== false;
  if (!hasSession || !profile?.id) {
    return {
      phase: "pending_auth",
      consentComplete: false,
      dibayIdComplete: false,
      profileComplete: false,
      legacyCompleted: false,
      signupComplete: false,
      onboardingStatus: "pending",
    };
  }

  if (isPrivilegedAdminRole(profile.role ?? null)) {
    return {
      phase: "completed",
      consentComplete: true,
      dibayIdComplete: true,
      profileComplete: true,
      legacyCompleted: true,
      signupComplete: true,
      onboardingStatus: "completed",
    };
  }

  const consentComplete = hasStoreTermsConsent({
    terms_accepted_at: profile.terms_accepted_at ?? null,
    terms_version: profile.terms_version ?? null,
    privacy_accepted_at: profile.privacy_accepted_at ?? null,
    privacy_version: profile.privacy_version ?? null,
  });
  const dibayIdComplete = isDibayIdComplete(profile);
  const profileComplete = isDibayProfileComplete(profile);
  const legacyCompleted = Boolean(profile.onboarding_completed_at);
  /**
   * CONTRACT — signupComplete (앱 HTML gate · DibaySignupGate · proxy · mutation 약관 403)
   * = consentComplete ONLY (법적 최소).
   * DO NOT: consent && dibayId && profile — @id/프로필 미완 사용자가
   *         /community-messenger/rooms|calls 진입 시 POST_LOGIN(/mypage)로 덮임 (2026-06-21 회귀).
   * @id·프로필·주소·전화: dibayIdComplete / profileComplete + requireProfileCompletion · requireAuthAction.
   */
  const signupComplete = consentComplete;

  let phase: DibaySignupPhase;
  if (signupComplete) {
    phase = "completed";
  } else {
    phase = "terms_required";
  }

  let onboardingStatus: DibayOnboardingStatusValue = "oauth_authenticated";
  const raw = pickTrimmed(profile.onboarding_status);
  if (raw === "pending" || raw === "oauth_authenticated" || raw === "terms_required" || raw === "id_required" || raw === "profile_ready" || raw === "completed") {
    onboardingStatus = raw;
  } else if (signupComplete) {
    onboardingStatus = "completed";
  } else if (!consentComplete) {
    onboardingStatus = "terms_required";
  } else if (!dibayIdComplete) {
    onboardingStatus = "id_required";
  } else if (!profileComplete) {
    onboardingStatus = "profile_ready";
  }

  return {
    phase,
    consentComplete,
    dibayIdComplete,
    profileComplete,
    legacyCompleted,
    signupComplete,
    onboardingStatus,
  };
}

export function isDibaySignupComplete(status: DibaySignupStatus): boolean {
  return status.signupComplete || status.phase === "completed";
}

export const DIBAY_SIGNUP_TERMS_PATH = "/auth/onboarding/terms";
export const DIBAY_SIGNUP_DIBAY_ID_PATH = "/auth/onboarding/dibay-id";

export function isDibaySignupGateExcludedPath(pathname: string): boolean {
  const p = (pathname ?? "").split("?")[0]?.trim() || "";
  if (isProfileSetupGateExcludedPath(p)) return true;
  return (
    p === "/login" ||
    p.startsWith("/login/") ||
    p === "/signup" ||
    p.startsWith("/signup/") ||
    p.startsWith("/auth/onboarding/") ||
    p === "/auth/consent" ||
    p.startsWith("/auth/consent") ||
    p.startsWith("/auth/callback") ||
    p === "/onboarding/username" ||
    p.startsWith("/onboarding/username/") ||
    p.startsWith("/terms") ||
    p.startsWith("/privacy") ||
    p.startsWith("/account/delete-request")
  );
}

export function resolveDibaySignupRoute(
  status: DibaySignupStatus,
  next?: string | null
): string {
  const safeNext = sanitizeNextPath(next ?? null);

  if (status.phase === "completed" || status.signupComplete) {
    return sanitizeFreshLoginLandingPath(safeNext) ?? POST_LOGIN_PATH;
  }
  if (!status.consentComplete || status.phase === "terms_required") {
    return withNextSearchParam(DIBAY_SIGNUP_TERMS_PATH, safeNext);
  }
  return sanitizeFreshLoginLandingPath(safeNext) ?? POST_LOGIN_PATH;
}
