"use client";

import type { Profile } from "@/lib/types/profile";
import { hasPhilippinePhoneVerification } from "@/lib/auth/store-member-policy";

/** `PhoneVerificationRequiredDialog` 가 수신 */
export const SAMARKET_PHONE_VERIFICATION_REQUIRED_EVENT = "samarket:phone-verification-required" as const;

export type PhoneVerificationRequiredDetail = {
  /** 인증 후 돌아올 내부 경로 (선택) */
  next?: string;
};

/**
 * 글쓰기·채팅 등 **전화(또는 관리자 동등 인증) 완료** 회원만 가능한 기능용.
 * 서버 `canUseVerifiedMemberFeatures` / `hasPhilippinePhoneVerification` 과 동일 판정.
 */
export function clientHasVerifiedContactForInteractive(user: Profile | null | undefined): boolean {
  if (!user?.id) return false;
  return hasPhilippinePhoneVerification({
    role: user.role ?? null,
    phone_verified: user.phone_verified === true,
    phone_verified_at: user.phone_verified_at ?? null,
    provider: user.provider ?? user.auth_provider ?? null,
    auth_provider: user.auth_provider ?? null,
    email: user.email ?? null,
  });
}

export function openPhoneVerificationRequiredDialog(detail: PhoneVerificationRequiredDetail = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PhoneVerificationRequiredDetail>(SAMARKET_PHONE_VERIFICATION_REQUIRED_EVENT, {
      detail: { next: detail.next },
    })
  );
}
