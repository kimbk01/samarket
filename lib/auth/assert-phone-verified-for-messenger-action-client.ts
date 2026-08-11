"use client";

import { isPrivilegedAdminAuthority } from "@/lib/auth/admin-policy";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { openPhoneVerificationRequiredSheet } from "@/lib/auth/phone-verification-required-client";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";
import type { Profile } from "@/lib/types/profile";

/**
 * Client phone gate — no new membership query.
 * Admin exemption uses server-derived `privilegedAdmin` on the profile snapshot only.
 * DO NOT treat profiles.role / is_admin mirror as Admin allow.
 */
export function clientProfilePassesPhoneVerification(user: Profile | null | undefined): boolean {
  if (!user?.id) return false;
  const privilegedAdmin = user.privilegedAdmin === true;
  if (isPrivilegedAdminAuthority({ privilegedAdmin })) return true;
  return hasVerifiedPhone({
    role: user.role,
    privilegedAdmin,
    phone_verified: user.phone_verified === true,
    phone_verified_at: user.phone_verified_at ?? null,
    phone_verification_method: user.phone_verification_method ?? null,
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
