import { hasPhilippinePhoneVerification } from "@/lib/auth/store-member-policy";
import type { ProfileRow } from "@/lib/profile/types";

/** 프로필 UI — 전화·실명 인증 행과 PhoneVerificationBox 와 동일한 정식 연락처 판정 */
export function isProfileContactVerified(
  profile: Pick<
    ProfileRow,
    | "role"
    | "privilegedAdmin"
    | "phone_verified"
    | "phone_verified_at"
    | "provider"
    | "auth_provider"
    | "email"
    | "auth_login_email"
  >
): boolean {
  return hasPhilippinePhoneVerification({
    role: profile.role ?? null,
    privilegedAdmin: profile.privilegedAdmin === true,
    phone_verified: profile.phone_verified === true,
    phone_verified_at: profile.phone_verified_at ?? null,
    provider: profile.provider ?? profile.auth_provider ?? null,
    auth_provider: profile.auth_provider ?? profile.provider ?? null,
    email: profile.auth_login_email ?? profile.email ?? null,
  });
}

export function resolveProfileLoginEmail(
  profile: Pick<ProfileRow, "auth_login_email" | "email">
): string {
  return profile.auth_login_email?.trim() || profile.email?.trim() || "—";
}
