"use client";

import dynamic from "next/dynamic";
import { CallProvider } from "@/app/_providers/CallProvider";
import { importWithChunkRetry } from "@/lib/next/import-with-chunk-retry";
import { IncomingCallOverlayChunkBoundary } from "@/components/layout/providers/IncomingCallOverlayChunkBoundary";
import { CallActiveSessionRecoveryHost } from "@/components/layout/providers/CallActiveSessionRecoveryHost";
import { DibayFcmCallRouteHost } from "@/components/layout/providers/DibayFcmCallRouteHost";
import { DibayVoipCallBridgeHost } from "@/lib/push/native/dibay-voip-call-bridge";
import { isLegacyWebCallEstablishmentRemoved } from "@/lib/call/native/legacy-web-call-establishment-removed";
import { isCapacitorNativePlatform, resolveCapacitorShellPlatform } from "@/lib/platform/capacitor-native";
import { isDibayCallV3SafeLaneEnabled } from "@/lib/community-messenger/call-v3/call-v3-flag";
import { isCallV4TelegramLaneEnabled } from "@/lib/community-messenger/call-v4/call-v4-flag";

const CommunityMessengerActiveCallHost = dynamic(
  () =>
    import("@/components/layout/providers/CommunityMessengerActiveCallHost").then(
      (m) => m.CommunityMessengerActiveCallHost
    ),
  { ssr: false }
);

const CallV4IncomingChrome = dynamic(
  () =>
    import("@/components/community-messenger/call-v4/CallV4Provider").then((m) => m.CallV4IncomingChrome),
  { ssr: false }
);

const CallV3IncomingBanner = dynamic(
  () =>
    import("@/components/community-messenger/call-v3/CallV3IncomingBanner").then((m) => m.CallV3IncomingBanner),
  { ssr: false }
);

const CallV3Provider = dynamic(
  () => import("@/components/community-messenger/call-v3/CallV3Provider").then((m) => m.CallV3Provider),
  { ssr: false }
);

const IncomingCallOverlay = dynamic(
  () =>
    importWithChunkRetry(() =>
      import("@/components/community-messenger/IncomingCallOverlay").then((mod) => mod.IncomingCallOverlay)
    ),
  { ssr: false }
);

function LegacyCallIncomingChrome() {
  return (
    <CallProvider>
      <DibayFcmCallRouteHost />
      <DibayVoipCallBridgeHost />
      <CallActiveSessionRecoveryHost />
      <CommunityMessengerActiveCallHost />
      {/*
       * 전역 수신 호스트는 항상 마운트 — `/calls/:id` 에서도 벨·dedup·cleanup·타임아웃만 담당하고
       * UI 는 `GlobalCommunityMessengerIncomingCall` 내부 `hideGlobalIncomingOverlay` 로 숨긴다.
       */}
      <IncomingCallOverlayChunkBoundary>
        <IncomingCallOverlay />
      </IncomingCallOverlayChunkBoundary>
    </CallProvider>
  );
}

function CallV3IncomingChrome() {
  return (
    <CallV3Provider>
      <CallV3IncomingBanner />
    </CallV3Provider>
  );
}

/**
 * 수신 통화 오버레이만 `CallProvider`(CommunityCallSurface) 안에 둔다.
 * `useCommunityCallSurface` 소비처는 현재 수신 통화 UI뿐이라 전역 트리에서 분리해도 동일.
 *
 * Android native lane (`isLegacyWebCallEstablishmentRemoved`): CallV4 sync-only companion only — V3/Legacy never mount.
 * V4 Telegram Lane (`NEXT_PUBLIC_DIBAY_CALL_V4_TELEGRAM_LANE=1`): desktop/web establishment or Android sync-only.
 * V3 Safe Lane (`NEXT_PUBLIC_DIBAY_CALL_V3_SAFE_LANE=1`): legacy CallEngine hosts are not mounted.
 */
export function CallIncomingChrome() {
  if (isLegacyWebCallEstablishmentRemoved()) {
    return <CallV4IncomingChrome />;
  }
  if (isCallV4TelegramLaneEnabled()) {
    return <CallV4IncomingChrome />;
  }
  if (isCapacitorNativePlatform() && resolveCapacitorShellPlatform() === "ios") {
    return <CallV4IncomingChrome />;
  }
  if (isDibayCallV3SafeLaneEnabled()) {
    return <CallV3IncomingChrome />;
  }
  return <LegacyCallIncomingChrome />;
}
