"use client";

import { invokeNativeCallServicePlugin } from "@/lib/call/native/native-call-service";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

export type NativeMemberEventProjection = Readonly<{
  eligible: boolean;
  boundUserId?: string | null;
  reason: string;
}>;

/**
 * Native member private-event eligibility + bound user projection.
 * AUTHENTICATED → eligible + boundUserId; terminal guest / logout → ineligible (bound cleared).
 */
export async function projectNativeMemberEventEligibility(
  input: NativeMemberEventProjection,
): Promise<void> {
  if (!isCapacitorNativePlatform()) return;
  const reason = String(input.reason ?? "").trim() || "unspecified";
  const eligible = input.eligible === true;
  const boundUserId = eligible ? String(input.boundUserId ?? "").trim() : "";
  try {
    await invokeNativeCallServicePlugin("setMemberCallEligible", {
      eligible,
      reason,
      boundUserId,
    });
  } catch {
    /* best-effort — local prefs may still update on next successful bridge */
  }
}

/**
 * @deprecated Prefer {@link projectNativeMemberEventEligibility} so bound user stays in sync.
 * Native member incoming-call eligibility SSOT bridge.
 */
export async function setNativeMemberCallEligible(
  eligible: boolean,
  reason: string,
  boundUserId?: string | null,
): Promise<void> {
  await projectNativeMemberEventEligibility({
    eligible,
    boundUserId: eligible ? boundUserId : null,
    reason,
  });
}
