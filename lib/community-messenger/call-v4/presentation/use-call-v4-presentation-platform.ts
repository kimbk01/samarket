"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { canEnterCallV4PipOrDock } from "@/lib/community-messenger/call-v4/call-v4-connected-media-policy";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { isCallV4DockEnabled } from "@/lib/community-messenger/call-v4/call-v4-phase6-flags";
import {
  readCallV4PresentationCapabilitySnapshot,
  resolveCallV4PresentationPlatform,
} from "@/lib/community-messenger/call-v4/presentation/call-v4-presentation-capability";
import { callV4MinimizeConnectedCallToDock } from "@/lib/community-messenger/call-v4/presentation/call-v4-presentation-dock";
import { useCallV4AndroidPresentationAdapter } from "@/lib/community-messenger/call-v4/presentation/android/call-v4-presentation-android.adapter";
import { useCallV4IosPresentationAdapter } from "@/lib/community-messenger/call-v4/presentation/ios/call-v4-presentation-ios.adapter";
import { useCallV4WebPresentationAdapter } from "@/lib/community-messenger/call-v4/presentation/web/call-v4-presentation-web.adapter";
import { readCallV4ExitRouter } from "@/lib/community-messenger/call-v4/call-v4-route";
import type { CallV4Phase } from "@/lib/community-messenger/call-v4/call-v4-types";
import { isCallV4DedicatedSessionPath } from "@/lib/community-messenger/call-v4/call-v4-session-path";

type UseCallV4PresentationPlatformInput = {
  callId: string | null;
  phase: CallV4Phase;
  mediaType: "audio" | "video" | null;
  roomId: string | null;
};

/** Platform orchestrator — common route-leave dock + per-platform adapters. */
export function useCallV4PresentationPlatform(input: UseCallV4PresentationPlatformInput): void {
  const pathname = usePathname();
  const dockedRef = useRef<string | null>(null);
  const { callId, phase, mediaType, roomId } = input;

  useCallV4AndroidPresentationAdapter({ callId, phase, mediaType });
  useCallV4IosPresentationAdapter({ callId, phase, roomId });
  useCallV4WebPresentationAdapter({ callId, phase, roomId });

  useEffect(() => {
    const snapshot = readCallV4PresentationCapabilitySnapshot();
    logCallV4("presentation_capability_ready", {
      callId: callId?.trim() ?? null,
      platform: snapshot.platform,
      capabilities: snapshot.capabilities.join(","),
      iosNativePipAvailable: snapshot.iosNativePipAvailable,
    });
  }, [callId]);

  useEffect(() => {
    const sid = callId?.trim() ?? "";
    if (!sid || !isCallV4DockEnabled() || !canEnterCallV4PipOrDock(phase)) {
      dockedRef.current = null;
      return;
    }
    if (isCallV4DedicatedSessionPath(pathname, sid)) {
      dockedRef.current = null;
      return;
    }
    if (dockedRef.current === sid) return;
    dockedRef.current = sid;
    void callV4MinimizeConnectedCallToDock({
      callId: sid,
      roomId,
      reason: `${resolveCallV4PresentationPlatform()}_route_leave_floating_dock`,
      router: readCallV4ExitRouter() ?? undefined,
    });
  }, [callId, pathname, phase, roomId]);
}
