"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { canEnterCallV4PipOrDock } from "@/lib/community-messenger/call-v4/call-v4-connected-media-policy";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { callV4MinimizeConnectedCallToDock } from "@/lib/community-messenger/call-v4/presentation/call-v4-presentation-dock";
import {
  detectCallV4IosNativePipAvailable,
  resolveCallV4PresentationPlatform,
} from "@/lib/community-messenger/call-v4/presentation/call-v4-presentation-capability";
import { readCallV4ExitRouter } from "@/lib/community-messenger/call-v4/call-v4-route";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";
import { isCallV4DedicatedSessionPath } from "@/lib/community-messenger/call-v4/call-v4-session-path";

type CallV4IosPresentationInput = {
  callId: string | null;
  phase: CallV4Phase;
  roomId: string | null;
};

/**
 * iOS — no Android OS PiP parity.
 * Background / inactive → floating mini dock (same dock SSOT as Web).
 * Native PiP remains capability-gated for a future bridge.
 */
export function useCallV4IosPresentationAdapter(input: CallV4IosPresentationInput): void {
  const pathname = usePathname();
  const { callId, phase, roomId } = input;

  useEffect(() => {
    if (resolveCallV4PresentationPlatform() !== "ios") return;
    logCallV4("ios_presentation_capability", {
      callId: callId?.trim() ?? null,
      iosNativePipAvailable: detectCallV4IosNativePipAvailable(),
      fallback: "ios_dock_fallback",
    });
  }, [callId]);

  useEffect(() => {
    if (resolveCallV4PresentationPlatform() !== "ios") return;
    const sid = callId?.trim() ?? "";
    if (!sid || !canEnterCallV4PipOrDock(phase)) return;

    const onBackground = () => {
      if (document.visibilityState !== "hidden") return;
      if (!isCallV4DedicatedSessionPath(pathname, sid)) return;
      void callV4MinimizeConnectedCallToDock({
        callId: sid,
        roomId,
        reason: "ios_background_dock_fallback",
        router: readCallV4ExitRouter() ?? undefined,
      });
    };

    document.addEventListener("visibilitychange", onBackground);
    return () => document.removeEventListener("visibilitychange", onBackground);
  }, [callId, pathname, phase, roomId]);
}
