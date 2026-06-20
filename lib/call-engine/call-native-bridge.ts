"use client";

import type { DibayFcmCallBridgeHandlers } from "@/lib/community-messenger/dibay-fcm-call-bridge";
import { closeCallSession } from "@/lib/call-engine/close-call-session";
import { setCallEnginePhase } from "@/lib/call-engine/call-engine-state";
import { syncCallEngineRingFromState } from "@/lib/call-engine/call-ring-controller";
import type { CommunityMessengerCallKind } from "@/lib/community-messenger/types";
import { isCallEngineV2Enabled } from "@/lib/call-engine/flag";

/** FCM bridge handlers — engine phase/terminal only; accept/reject는 Global에서 engine 직접 호출 */
export function buildCallEngineNativeBridgeHandlers(
  base: DibayFcmCallBridgeHandlers,
): DibayFcmCallBridgeHandlers {
  if (!isCallEngineV2Enabled()) return base;

  return {
    ...base,
    onIncomingWake: (detail) => {
      const sessionId = detail.sessionId?.trim();
      if (sessionId) {
        const callKind: CommunityMessengerCallKind =
          detail.callKind === "video" ? "video" : "voice";
        setCallEnginePhase({
          phase: "incoming",
          sessionId,
          role: "callee",
          callKind,
          source: "fcm_wake",
        });
        syncCallEngineRingFromState();
      }
      base.onIncomingWake(detail);
    },
    onFcmTerminal: (detail) => {
      if (detail.callId) {
        void closeCallSession(detail.callId, detail.terminalKind ?? "ended", {
          source: `fcm_${detail.bridgeSource ?? "terminal"}`,
          skipPatch: true,
        });
      }
      base.onFcmTerminal?.(detail);
    },
  };
}
