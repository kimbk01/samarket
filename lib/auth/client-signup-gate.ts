import type { Profile } from "@/lib/types/profile";
import { normalizeProfilePublicIdFields } from "@/lib/auth/dibay-public-id-ssot";
import {
  deriveDibaySignupStatus,
  type DibaySignupProfileInput,
} from "@/lib/auth/dibay-signup-status";

/** Profile 캐시 → deriveDibaySignupStatus 입력 (누락 필드는 false 쪽으로 수렴) */
export function profileToDibaySignupInput(user: Profile): DibaySignupProfileInput {
  return {
    id: user.id,
    ...normalizeProfilePublicIdFields({
      dibay_id: user.dibay_id ?? null,
      dibay_id_locked: user.dibay_id_locked ?? null,
      username: user.username ?? null,
      username_confirmed: user.username_confirmed ?? null,
    }),
    display_name: user.display_name ?? user.nickname ?? null,
    avatar_url: user.avatar_url ?? null,
    terms_accepted_at: user.terms_accepted_at ?? null,
    terms_version: user.terms_version ?? null,
    privacy_accepted_at: user.privacy_accepted_at ?? null,
    privacy_version: user.privacy_version ?? null,
    onboarding_completed_at: user.onboarding_completed_at ?? null,
    onboarding_status: user.onboarding_status ?? null,
    role: user.role ?? null,
  };
}

/** 클라이언트 프로필 캐시 기준 DIBAY signupComplete — 서버 deriveDibaySignupStatus 와 동일 */
export function isClientSignupComplete(user: Profile | null | undefined): boolean {
  if (!user?.id) return false;
  return deriveDibaySignupStatus(profileToDibaySignupInput(user), { hasSession: true }).signupComplete;
}
