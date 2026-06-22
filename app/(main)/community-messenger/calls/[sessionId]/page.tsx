"use client";

import { useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { CommunityMessengerCallClient } from "@/components/community-messenger/CommunityMessengerCallClient";
import { CommunityMessengerCallRouteLoading } from "@/components/community-messenger/CommunityMessengerCallRouteLoading";
import { CommunityMessengerCallEnterShell } from "@/components/community-messenger/call-history/CommunityMessengerCallEnterShell";
import { subscribeCommunityCallHostSync } from "@/components/layout/providers/CommunityMessengerActiveCallHost";
import { isCallSessionHostedByActiveCallHost } from "@/lib/community-messenger/direct-call-minimize";

/**
 * 통화 화면 — active direct 영상통화는 `CommunityMessengerActiveCallHost` 가 CallClient 를 단일 상주.
 * host 플래그 갱신 시 이 페이지 CallClient 는 즉시 언마운트해 이중 Agora 조인을 막는다.
 */
export default function CommunityMessengerCallPage() {
  const params = useParams();
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
    return null;
  }

  return (
    <CommunityMessengerCallEnterShell>
      <CommunityMessengerCallClient key={sessionId} sessionId={sessionId} initialSession={null} />
    </CommunityMessengerCallEnterShell>
  );
}
