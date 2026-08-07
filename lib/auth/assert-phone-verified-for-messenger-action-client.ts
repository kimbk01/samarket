"use client";

import { getCurrentUser } from "@/lib/auth/get-current-user";
import { openPhoneVerificationRequiredSheet } from "@/lib/auth/phone-verification-required-client";
import { hasPhilippinePhoneVerification } from "@/lib/auth/store-member-policy";
import type { Profile } from "@/lib/types/profile";

/**
 * Client phone gate — no new membership query.
 * Application cutover: do NOT treat profiles.role / is_admin mirror as Admin exemption.
 * Server routes enforce membership-only exemption; client denies-by-default for admin bypass.
 */
export function clientProfilePassesPhoneVerification(user: Profile | null | undefined): boolean {
  if (!user?.id) return false;
  return hasPhilippinePhoneVerification({
    role: user.role,
    privilegedAdmin: false,
    phone_verified: user.phone_verified === true,
    phone_verified_at: user.phone_verified_at ?? null,
    provider: user.provider ?? user.auth_provider,
    auth_provider: user.auth_provider,
    email: user.email,
  });
}

export function resolveMessengerActionReturnPath(fallback = "/community-messenger"): string {
  if (typeof window === "undefined") return fallback;
  const href = `${window.location.pathname}${window.location.search}`.trim();
  return href || fallback;
}

/** 메신저 메시지·통화 등 — 본인 전화 미인증이면 동일 바텀시트를 연다. */
export function assertPhoneVerifiedForMessengerActionOrOpenSheet(nextPath?: string): boolean {
  if (clientProfilePassesPhoneVerification(getCurrentUser())) return true;
  openPhoneVerificationRequiredSheet({
    next: nextPath?.trim() || resolveMessengerActionReturnPath(),
  });
  return false;
}
