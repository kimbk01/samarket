"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { canEnterCallV4PipOrDock } from "@/lib/community-messenger/call-v4/call-v4-connected-media-policy";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { callV4MinimizeConnectedCallToDock } from "@/lib/community-messenger/call-v4/presentation/call-v4-presentation-dock";
import { resolveCallV4PresentationPlatform } from "@/lib/community-messenger/call-v4/presentation/call-v4-presentation-capability";
import { readCallV4ExitRouter } from "@/lib/community-messenger/call-v4/call-v4-route";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";
import { isCallV4DedicatedSessionPath } from "@/lib/community-messenger/call-v4/call-v4-session-path";

type CallV4WebPresentationInput = {
  callId: string | null;
  phase: CallV4Phase;
  roomId: string | null;
};

/**
 * Windows / browser Web — floating dock (`web_floating_dock`, no OS PiP).
 * Tab visibility hidden while still on call route → dock without Agora rejoin.
 */
export function useCallV4WebPresentationAdapter(input: CallV4WebPresentationInput): void {
  const pathname = usePathname();
  const { callId, phase, roomId } = input;
  const tabHiddenRef = useRef(false);

  useEffect(() => {
    if (resolveCallV4PresentationPlatform() !== "web") return;
    const sid = callId?.trim() ?? "";
    if (!sid || !canEnterCallV4PipOrDock(phase)) {
      tabHiddenRef.current = false;
      return;
    }

    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      if (hidden && !tabHiddenRef.current && isCallV4DedicatedSessionPath(pathname, sid)) {
        tabHiddenRef.current = true;
        logCallV4("web_tab_hidden_preserve_agora", { callId: sid });
        void callV4MinimizeConnectedCallToDock({
          callId: sid,
          roomId,
          reason: "web_tab_hidden_floating_dock",
          router: readCallV4ExitRouter() ?? undefined,
        });
        return;
      }
      if (!hidden) tabHiddenRef.current = false;
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [callId, pathname, phase, roomId]);
}
