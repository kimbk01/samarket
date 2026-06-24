"use client";

import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";

type DibayVoipCallPlugin = {
  claimForegroundWebIncomingOwner(options: {
    sessionId: string;
    reason?: string;
  }): Promise<{ claimed?: boolean }>;
};

export async function tryClaimIosCapacitorWebIncomingOwner(
  callId: string,
  reason: string,
): Promise<boolean> {
  if (resolveCapacitorShellPlatform() !== "ios") return false;
  const sid = callId.trim();
  if (!sid) return false;

  try {
    const { registerPlugin } = await import("@capacitor/core");
    const plugin = registerPlugin<DibayVoipCallPlugin>("DibayVoipCall");
    const res = await plugin.claimForegroundWebIncomingOwner({ sessionId: sid, reason });
    const claimed = res.claimed === true;
    logCallV4("ios_shell_owner_claim", { callId: sid, reason, claimed });
    return claimed;
  } catch {
    logCallV4("ios_shell_owner_claim_failed", { callId: sid, reason });
    return false;
  }
}
