"use client";

import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { markCallV4WebCallScreenReady } from "@/lib/community-messenger/call-v4/call-v4-exit-guard";
import { getSyncNativeIncomingCallPlugin } from "@/lib/push/native/push-route-native-bridge";

export const CALL_V4_WEB_CALL_SCREEN_READY_EVENT = "dibay:call-v4-web-call-screen-ready";

export type CallV4WebCallScreenReadyPhase = "connecting" | "connected";

export function notifyCallV4WebCallScreenReady(
  callId: string,
  phase: CallV4WebCallScreenReadyPhase,
): void {
  const sid = callId.trim();
  if (!sid) return;
  logCallV4("web_call_screen_ready_emit", { callId: sid, phase });
  logCallV4("web_call_screen_ready", { callId: sid, phase });
  markCallV4WebCallScreenReady(sid, phase);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(CALL_V4_WEB_CALL_SCREEN_READY_EVENT, {
        detail: { callId: sid, phase },
      }),
    );
  }
  const plugin = getSyncNativeIncomingCallPlugin();
  if (!plugin?.notifyWebCallScreenReady) return;
  void plugin.notifyWebCallScreenReady({ callId: sid, phase }).catch(() => {
    /* best-effort native handoff */
  });
}
