"use client";

import { useEffect } from "react";
import { endNativeCallService, startNativeCallService } from "@/lib/call/native/native-call-service";
import { canEnterCallV4PipOrDock } from "@/lib/community-messenger/call-v4/call-v4-connected-media-policy";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { isCallV4PipEnabled } from "@/lib/community-messenger/call-v4/call-v4-phase6-flags";
import { supportsCallV4AndroidOsPipBridge } from "@/lib/community-messenger/call-v4/presentation/call-v4-presentation-capability";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";

type CallV4AndroidPresentationInput = {
  callId: string | null;
  phase: CallV4Phase;
  mediaType: "audio" | "video" | null;
};

/** Android-only — FGS active session for OS PiP + background audio. */
export function useCallV4AndroidPresentationAdapter(input: CallV4AndroidPresentationInput): void {
  const { callId, phase, mediaType } = input;

  useEffect(() => {
    const sid = callId?.trim() ?? "";
    if (!sid || !supportsCallV4AndroidOsPipBridge() || !isCallV4PipEnabled()) return;
    if (!canEnterCallV4PipOrDock(phase)) return;
    const callKind = mediaType === "video" ? "video" : "voice";
    void startNativeCallService(sid, { callKind, phase: "active" }).then((ok) => {
      if (ok) logCallV4("android_native_active_session_started", { callId: sid, callKind });
    });
  }, [callId, mediaType, phase]);
}

export async function stopCallV4AndroidNativeActiveSession(callId: string, reason = "terminal"): Promise<void> {
  const sid = callId.trim();
  if (!sid) return;
  await endNativeCallService(sid, reason);
  logCallV4("android_native_active_session_stopped", { callId: sid, reason });
}
