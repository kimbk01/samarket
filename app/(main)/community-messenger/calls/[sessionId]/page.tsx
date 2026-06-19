"use client";

import { useSyncExternalStore } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CommunityMessengerCallRouteLoading } from "@/components/community-messenger/CommunityMessengerCallRouteLoading";
import { CommunityMessengerCallEnterShell } from "@/components/community-messenger/call-history/CommunityMessengerCallEnterShell";
import { CommunityMessengerCallPageAcceptShellLayer } from "@/components/community-messenger/call-ui/CommunityMessengerCallPageAcceptShellLayer";
import { subscribeCommunityCallHostSync } from "@/components/layout/providers/CommunityMessengerActiveCallHost";
import { isCallSessionHostedByActiveCallHost } from "@/lib/community-messenger/direct-call-minimize";
import { isCommunityMessengerTempCallSessionId } from "@/lib/community-messenger/call-session-navigation-seed";

/** 수신 accept route — enter slide 생략 (P1-1b; outgoing tmp dial 과 별도) */
function isIncomingAcceptInstantEnterRoute(searchParams: URLSearchParams): boolean {
  return searchParams.get("action") === "accept" || searchParams.get("nativeAccept") === "1";
}

/**
 * 통화 화면 — active direct 영상통화는 `CommunityMessengerActiveCallHost` 가 CallClient 를 단일 상주.
 * host 플래그 갱신 시 이 페이지 CallClient 는 즉시 언마운트해 이중 Agora 조인을 막는다.
 */
export default function CommunityMessengerCallPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const raw = params?.sessionId;
  const sessionId = Array.isArray(raw) ? String(raw[0] ?? "").trim() : String(raw ?? "").trim();

  const hostOwnsSession = useSyncExternalStore(
    subscribeCommunityCallHostSync,
    () => (sessionId ? isCallSessionHostedByActiveCallHost(sessionId) : false),
    () => false
  );

  if (!sessionId) {
    return <CommunityMessengerCallRouteLoading />;
  }

  if (hostOwnsSession) {
    return (
      <div className="fixed inset-0 z-[1280] flex min-h-0 flex-col bg-[#003D29]">
        <CommunityMessengerCallRouteLoading />
      </div>
    );
  }

  const instantOutgoingDialEnter = isCommunityMessengerTempCallSessionId(sessionId);
  const instantIncomingAcceptEnter = isIncomingAcceptInstantEnterRoute(searchParams);
  const isAcceptRoute = instantIncomingAcceptEnter;

  return (
    <CommunityMessengerCallEnterShell
      instantOutgoingDialEnter={instantOutgoingDialEnter}
      instantIncomingAcceptEnter={instantIncomingAcceptEnter}
    >
      <CommunityMessengerCallPageAcceptShellLayer sessionId={sessionId} isAcceptRoute={isAcceptRoute} />
    </CommunityMessengerCallEnterShell>
  );
}
