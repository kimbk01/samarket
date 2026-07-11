"use client";

import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { invokeNativeCallServicePlugin } from "@/lib/call/native/native-call-service";
import { dibayVoipCallPlugin } from "@/lib/push/native/dibay-voip-call-plugin";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

export async function tryClaimIosCapacitorWebIncomingOwner(
  callId: string,
  reason: string,
): Promise<boolean> {
  if (resolveCapacitorShellPlatform() !== "ios") return false;
  const sid = callId.trim();
  if (!sid) return false;

  try {
    const lane = await invokeNativeCallServicePlugin<{ enabled?: boolean }>(
      "isNativeVoiceIncomingLaneEnabled",
    );
    if (lane?.enabled === true) {
      logCallV4("ios_shell_owner_claim_skipped", {
        callId: sid,
        reason: "native_voice_incoming_lane",
      });
      return false;
    }

    const res = await dibayVoipCallPlugin.claimForegroundWebIncomingOwner({ sessionId: sid, reason });
    const claimed = res.claimed === true;
    logCallV4("ios_shell_owner_claim", { callId: sid, reason, claimed });
    return claimed;
  } catch {
    logCallV4("ios_shell_owner_claim_failed", { callId: sid, reason });
    return false;
  }
}
