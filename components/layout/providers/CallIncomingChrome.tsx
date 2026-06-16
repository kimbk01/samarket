"use client";

import dynamic from "next/dynamic";
import { CallProvider } from "@/app/_providers/CallProvider";
import { importWithChunkRetry } from "@/lib/next/import-with-chunk-retry";
import { IncomingCallOverlayChunkBoundary } from "@/components/layout/providers/IncomingCallOverlayChunkBoundary";
import { CallActiveSessionRecoveryHost } from "@/components/layout/providers/CallActiveSessionRecoveryHost";
import { CommunityMessengerActiveCallHost } from "@/components/layout/providers/CommunityMessengerActiveCallHost";
import { DibayFcmCallRouteHost } from "@/components/layout/providers/DibayFcmCallRouteHost";

const IncomingCallOverlay = dynamic(
  () =>
    importWithChunkRetry(() =>
      import("@/components/community-messenger/IncomingCallOverlay").then((mod) => mod.IncomingCallOverlay)
    ),
  { ssr: false }
);

/**
 * 수신 통화 오버레이만 `CallProvider`(CommunityCallSurface) 안에 둔다.
 * `useCommunityCallSurface` 소비처는 현재 수신 통화 UI뿐이라 전역 트리에서 분리해도 동일.
 */
export function CallIncomingChrome() {
  return (
    <CallProvider>
      <DibayFcmCallRouteHost />
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
