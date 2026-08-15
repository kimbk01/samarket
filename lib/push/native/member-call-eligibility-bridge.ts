"use client";

import { invokeNativeCallServicePlugin } from "@/lib/call/native/native-call-service";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

/**
 * Native member incoming-call eligibility SSOT bridge.
 * AUTHENTICATED → eligible; terminal guest / logout → ineligible.
 */
export async function setNativeMemberCallEligible(
  eligible: boolean,
  reason: string,
): Promise<void> {
  if (!isCapacitorNativePlatform()) return;
  try {
    await invokeNativeCallServicePlugin("setMemberCallEligible", {
      eligible: eligible === true,
      reason: String(reason ?? "").trim() || "unspecified",
    });
  } catch {
    /* best-effort — server unbind remains primary */
  }
}
