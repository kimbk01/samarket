import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import {
  PHONE_VERIFICATION_REQUIRED_MESSAGE,
  bypassesPhilippinePhoneVerificationGate,
} from "@/lib/auth/member-access";
import type { ProfileRow } from "@/lib/profile/types";
import type { Profile } from "@/lib/types/profile";

function bypassFromProfileRow(
  p: Pick<
    ProfileRow,
    | "role"
    | "phone_verified"
    | "phone_verified_at"
    | "provider"
    | "auth_provider"
    | "email"
    | "privilegedAdmin"
  >
): boolean {
  return bypassesPhilippinePhoneVerificationGate({
    role: p.role,
    privilegedAdmin: p.privilegedAdmin === true,
    phone_verified: p.phone_verified === true,
    phone_verified_at: p.phone_verified_at ?? null,
    provider: p.provider ?? p.auth_provider,
    auth_provider: p.auth_provider,
    email: p.email,
  });
}

function bypassFromClientProfile(p: Profile): boolean {
  return bypassesPhilippinePhoneVerificationGate({
    role: p.role,
    privilegedAdmin: p.privilegedAdmin === true,
    phone_verified: p.phone_verified === true,
    phone_verified_at: p.phone_verified_at ?? null,
    provider: p.provider ?? p.auth_provider,
    auth_provider: p.auth_provider ?? null,
    email: p.email ?? null,
  });
}

/**
 * 글 등록·수정 전 전화 인증 게이트.
 * - 클라이언트 프로필 캐시가 `hasPhilippinePhoneVerification` 이면 `/api/me/profile` 왕복 생략.
 */
export async function assertPhoneAllowsPostWrite(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const cached = getCurrentUser();
  if (cached && bypassFromClientProfile(cached)) {
    return { ok: true };
  }
  const profile = await getMyProfile();
  if (!profile || !bypassFromProfileRow(profile)) {
    return { ok: false, error: PHONE_VERIFICATION_REQUIRED_MESSAGE };
  }
  return { ok: true };
}
