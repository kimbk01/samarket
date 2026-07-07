"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore, useEffect, useState, type ComponentType } from "react";
import { useParams, useRouter } from "next/navigation";
import { CommunityMessengerCallRouteLoading } from "@/components/community-messenger/CommunityMessengerCallRouteLoading";
import { CommunityMessengerCallEnterShell } from "@/components/community-messenger/call-history/CommunityMessengerCallEnterShell";
import { subscribeCommunityCallHostSync } from "@/components/layout/providers/CommunityMessengerActiveCallHost";
import { isCallSessionHostedByActiveCallHost } from "@/lib/community-messenger/direct-call-minimize";
import { isDibayCallV3SafeLaneEnabled } from "@/lib/community-messenger/call-v3/call-v3-flag";
import { isCallV4TelegramLaneEnabled } from "@/lib/community-messenger/call-v4/call-v4-flag";
import { isCommunityMessengerTempCallSessionId } from "@/lib/community-messenger/call-session-navigation-seed";

const CommunityMessengerCallClient = dynamic(
  () =>
    import("@/components/community-messenger/CommunityMessengerCallClient").then(
      (m) => m.CommunityMessengerCallClient
    ),
  { ssr: false, loading: () => null }
);

type CallV3ScreenProps = {
  callId: string;
};

function CallV3ScreenLazy({ callId }: CallV3ScreenProps) {
  const [Screen, setScreen] = useState<ComponentType<CallV3ScreenProps> | null>(null);

  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    void import("@/components/community-messenger/call-v3/CallV3Screen").then((mod) => {
      if (!cancelled) setScreen(() => mod.CallV3Screen);
    });
    return () => {
      cancelled = true;
    };
  }, [callId]);

  if (!callId || !Screen) {
    return null;
  }

  return <Screen callId={callId} />;
}

/**
 * 통화 화면 — active direct 영상통화는 `CommunityMessengerActiveCallHost` 가 CallClient 를 단일 상주.
 * host 플래그 갱신 시 이 페이지 CallClient 는 즉시 언마운트해 이중 Agora 조인을 막는다.
 *
 * V3 Safe Lane: flag ON 시 legacy CallClient 대신 V3 adapter(`CallV3Screen`) — 기존 UI + V3 엔진.
 */
export default function CommunityMessengerCallPage() {
  const params = useParams();
  const router = useRouter();
  const raw = params?.sessionId;
  const sessionId = Array.isArray(raw) ? String(raw[0] ?? "").trim() : String(raw ?? "").trim();
  const v3SafeLane = isDibayCallV3SafeLaneEnabled();
  const v4Lane = isCallV4TelegramLaneEnabled();

  useEffect(() => {
    if (!sessionId || !v4Lane) return;
    const qs = typeof window !== "undefined" ? window.location.search : "";
    if (isCommunityMessengerTempCallSessionId(sessionId)) {
      router.replace(`/community-messenger/calls/outgoing${qs}`);
      return;
    }
    router.replace(`/community-messenger/calls-v4/${encodeURIComponent(sessionId)}${qs}`);
  }, [router, sessionId, v4Lane]);

  const hostOwnsSession = useSyncExternalStore(
    subscribeCommunityCallHostSync,
    () => (sessionId && !v3SafeLane ? isCallSessionHostedByActiveCallHost(sessionId) : false),
    () => false
  );

  if (!sessionId) {
    return <CommunityMessengerCallRouteLoading />;
  }

  if (v4Lane) {
    return <CommunityMessengerCallRouteLoading />;
  }

  if (hostOwnsSession) {
    return null;
  }

  if (v3SafeLane) {
    return (
      <CommunityMessengerCallEnterShell>
        <CallV3ScreenLazy callId={sessionId} />
      </CommunityMessengerCallEnterShell>
    );
  }

  return (
    <CommunityMessengerCallEnterShell>
      <CommunityMessengerCallClient key={sessionId} sessionId={sessionId} initialSession={null} />
    </CommunityMessengerCallEnterShell>
  );
}
