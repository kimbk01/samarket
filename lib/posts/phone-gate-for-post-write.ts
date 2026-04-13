import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import {
  PHONE_VERIFICATION_REQUIRED_MESSAGE,
  bypassesPhilippinePhoneVerificationGate,
} from "@/lib/auth/member-access";

/**
 * 글 등록·수정 전 전화 인증 게이트.
 * - 클라이언트 프로필 캐시에 `phone_verified`·`role` 이 있으면 `/api/me/profile` 왕복 생략(체감 지연 감소).
 */
export async function assertPhoneAllowsPostWrite(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const cached = getCurrentUser();
  if (cached) {
    if (
      bypassesPhilippinePhoneVerificationGate({
        role: cached.role,
        phone_verified: cached.phone_verified === true,
        auth_provider: cached.auth_provider,
        email: cached.email,
      })
    ) {
      return { ok: true };
    }
    if (cached.phone_verified === false) {
      return { ok: false, error: PHONE_VERIFICATION_REQUIRED_MESSAGE };
    }
  }

  const profile = await getMyProfile();
  if (
    profile &&
    !bypassesPhilippinePhoneVerificationGate({
      role: profile.role,
      phone_verified: profile.phone_verified === true,
      auth_provider: profile.auth_provider ?? null,
      email: profile.email,
    })
  ) {
    return { ok: false, error: PHONE_VERIFICATION_REQUIRED_MESSAGE };
  }
  return { ok: true };
}
