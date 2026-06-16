"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { CallProvider } from "@/app/_providers/CallProvider";
import { importWithChunkRetry } from "@/lib/next/import-with-chunk-retry";
import { IncomingCallOverlayChunkBoundary } from "@/components/layout/providers/IncomingCallOverlayChunkBoundary";
import { CallActiveSessionRecoveryHost } from "@/components/layout/providers/CallActiveSessionRecoveryHost";
import { CommunityMessengerActiveCallHost } from "@/components/layout/providers/CommunityMessengerActiveCallHost";
import { isCallV3Enabled, logCallV3FeatureFlag } from "@/lib/call-v3/call-v3-feature-flag";
import { logCallV3 } from "@/lib/call-v3/call-v3-log";

const IncomingCallOverlay = dynamic(
  () =>
    importWithChunkRetry(() =>
      import("@/components/community-messenger/IncomingCallOverlay").then((mod) => mod.IncomingCallOverlay)
    ),
  { ssr: false }
);

const DibayCallHost = dynamic(
  () => importWithChunkRetry(() => import("@/components/call-v3/DibayCallHost").then((m) => m.DibayCallHost)),
  { ssr: false }
);

/**
 * 수신 통화 오버레이 — call-v3 ON 시 DibayCallHost, OFF 시 레거시 GlobalIncoming.
 */
export function CallIncomingChrome() {
  const v3Enabled = isCallV3Enabled();

  useEffect(() => {
    logCallV3FeatureFlag("CallIncomingChrome");
    if (v3Enabled) {
      logCallV3("host_mounted", { host: "DibayCallHost" });
      logCallV3("legacy_blocked_when_v3_enabled", { surface: "CallIncomingChrome" });
    } else {
      logCallV3("host_mounted", {
        host: "legacy",
        surfaces: ["CallActiveSessionRecoveryHost", "CommunityMessengerActiveCallHost", "IncomingCallOverlay"],
      });
    }
  }, [v3Enabled]);

  if (v3Enabled) {
    return (
      <CallProvider>
        <DibayCallHost />
      </CallProvider>
    );
  }

  return (
    <CallProvider>
      <CallActiveSessionRecoveryHost />
      <CommunityMessengerActiveCallHost />
      <IncomingCallOverlayChunkBoundary>
        <IncomingCallOverlay />
      </IncomingCallOverlayChunkBoundary>
    </CallProvider>
  );
}
