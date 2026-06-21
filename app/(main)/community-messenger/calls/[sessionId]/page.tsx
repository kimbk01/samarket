"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import { CommunityMessengerCallClient } from "@/components/community-messenger/CommunityMessengerCallClient";
import { CommunityMessengerCallEnterShell } from "@/components/community-messenger/call-history/CommunityMessengerCallEnterShell";
import { isCommunityMessengerTempCallSessionId, navigateBackFromCommunityMessengerCall, shouldSkipCallRouteEnterSlide } from "@/lib/community-messenger/call-session-navigation-seed";

/** 수신 accept route — enter slide 생략 (P1-1b; outgoing tmp dial 과 별도) */
function isIncomingAcceptInstantEnterRoute(searchParams: URLSearchParams): boolean {
  return searchParams.get("action") === "accept" || searchParams.get("nativeAccept") === "1";
}

/**
 * 통화 화면 — `/calls/[sessionId]` 는 이 페이지 CallClient 가 항상 단일 소유.
 * PiP·dock 등 off-route retained presentation 만 ActiveCallHost 가 CallClient 를 상주한다.
 */
export default function CommunityMessengerCallPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const raw = params?.sessionId;
  const sessionId = Array.isArray(raw) ? String(raw[0] ?? "").trim() : String(raw ?? "").trim();
  const exitOnceRef = useRef(false);

  useLayoutEffect(() => {
    if (sessionId || exitOnceRef.current) return;
    exitOnceRef.current = true;
    navigateBackFromCommunityMessengerCall(router, null);
  }, [router, sessionId]);

  if (!sessionId) {
    return null;
  }

  const instantOutgoingDialEnter = shouldSkipCallRouteEnterSlide(sessionId, searchParams);
  const instantIncomingAcceptEnter = isIncomingAcceptInstantEnterRoute(searchParams);

  return (
    <CommunityMessengerCallEnterShell
      instantOutgoingDialEnter={instantOutgoingDialEnter}
      instantIncomingAcceptEnter={instantIncomingAcceptEnter}
    >
      <CommunityMessengerCallClient key={sessionId} sessionId={sessionId} initialSession={null} />
    </CommunityMessengerCallEnterShell>
  );
}
