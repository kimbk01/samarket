"use client";

import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { invokeNativeCallServicePlugin } from "@/lib/call/native/native-call-service";
import { dibayVoipCallPlugin } from "@/lib/push/native/dibay-voip-call-plugin";
import { resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { isIosAppOnMacCached } from "@/lib/call/native/call-platform-capability-client";
import {
  applyCallV4SurfaceOwnerSignal,
  getCallV4PersistedSurfaceOwner,
} from "@/lib/community-messenger/call-v4/call-v4-incoming-surface";

export async function tryClaimIosCapacitorWebIncomingOwner(
  callId: string,
  reason: string,
): Promise<boolean> {
  if (resolveCapacitorShellPlatform() !== "ios") return false;
  const sid = callId.trim();
  if (!sid) return false;

  // D2-3 (docs/audit/mac-ipad-call-and-bottom-bar-audit-2026-11-15.md §10-8): 맥(iOS 앱)은 PushKit·CallKit 수신이
  // 없어 네이티브 수신 주체가 생기지 않는다 — 웹 시트가 벨 주체(web_in_app). 브라우저와 같은 웹 쪽 주체 선언.
  if (isIosAppOnMacCached()) {
    const existing = getCallV4PersistedSurfaceOwner(sid);
    if (existing !== "none" && existing !== "web_in_app") return false;
    applyCallV4SurfaceOwnerSignal({ callId: sid, owner: "web_in_app", reason, ts: Date.now() });
    logCallV4("ios_shell_owner_claim", { callId: sid, reason, claimed: true, mac: true });
    return true;
  }

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
