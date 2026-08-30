"use client";

/**
 * CONTRACT 1 — local fail-closed before remote logout cleanup.
 * Sets native member-event eligibility OFF (and clears bound user on native)
 * so previous-account FCM/APNs/VoIP cannot present even if deactivate fails.
 */

import { projectNativeMemberEventEligibility } from "@/lib/push/native/member-call-eligibility-bridge";

export async function applyLocalLogoutFailClosed(reason: string): Promise<void> {
  await projectNativeMemberEventEligibility({
    eligible: false,
    boundUserId: null,
    reason: reason || "logout_local_fail_closed",
  });
}
