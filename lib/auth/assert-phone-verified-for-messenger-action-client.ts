"use client";

import { isPrivilegedAdminAuthority } from "@/lib/auth/admin-policy";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { openPhoneVerificationRequiredSheet } from "@/lib/auth/phone-verification-required-client";
import { hasPhilippinePhoneVerification } from "@/lib/auth/store-member-policy";
import type { Profile } from "@/lib/types/profile";

/**
 * Client phone gate — no new membership query.
 * Admin exemption trusts server Profile snapshot:
 * - transitional privileged `role`, or
 * - `is_admin === true` affirmative from server (dual-write / CURRENT privilege mirror).
 * Does not use NEXT_PUBLIC_ADMIN_ROLE / localStorage / username / email.
 */
export function clientProfilePassesPhoneVerification(user: Profile | null | undefined): boolean {
  if (!user?.id) return false;
  const privilegedAdmin = user.is_admin === true ? true : undefined;
  if (isPrivilegedAdminAuthority({ role: user.role, privilegedAdmin })) return true;
  return hasPhilippinePhoneVerification({
    role: user.role,
    privilegedAdmin,
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
