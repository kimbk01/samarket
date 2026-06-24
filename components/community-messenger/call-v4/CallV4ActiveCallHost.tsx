"use client";

import { DibayCallPipBridgeHost } from "@/components/layout/providers/DibayCallPipBridgeHost";
import { GlobalCallDockHost } from "@/components/layout/providers/GlobalCallDockHost";
import { canEnterCallV4PipOrDock } from "@/lib/community-messenger/call-v4/call-v4-connected-media-policy";
import { isCallV4DockEnabled, isCallV4PipEnabled } from "@/lib/community-messenger/call-v4/call-v4-phase6-flags";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";
import { supportsCallV4AndroidOsPipBridge } from "@/lib/community-messenger/call-v4/presentation/call-v4-presentation-capability";

/**
 * V4 connected-layer hosts — platform adapters mount presentation chrome.
 * Android: OS PiP bridge + floating dock.
 * iOS / Web: floating mini dock only (iOS native PiP capability-gated separately).
 */
export function CallV4ActiveCallHost() {
  const phase = useCallV4Store((s) => s.phase);
  const callId = useCallV4Store((s) => s.identity?.callId ?? null);
  const active = Boolean(callId) && canEnterCallV4PipOrDock(phase);

  if (!active) return null;

  const showAndroidPipBridge = isCallV4PipEnabled() && supportsCallV4AndroidOsPipBridge();
  const showFloatingDock = isCallV4DockEnabled();

  return (
    <>
      {showAndroidPipBridge ? <DibayCallPipBridgeHost /> : null}
      {showFloatingDock ? <GlobalCallDockHost /> : null}
    </>
  );
}

