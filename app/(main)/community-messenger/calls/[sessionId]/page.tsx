"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { CommunityMessengerCallClient } from "@/components/community-messenger/CommunityMessengerCallClient";
import { CommunityMessengerCallRouteLoading } from "@/components/community-messenger/CommunityMessengerCallRouteLoading";
import { subscribeCommunityCallHostSync } from "@/components/layout/providers/CommunityMessengerActiveCallHost";
import { isCallSessionHostedByActiveCallHost } from "@/lib/community-messenger/direct-call-minimize";
import { isCallV3Enabled } from "@/lib/call-v3/call-v3-feature-flag";
import { importWithChunkRetry } from "@/lib/next/import-with-chunk-retry";

const DibayCallScreen = dynamic(
  () => importWithChunkRetry(() => import("@/components/call-v3/DibayCallScreen").then((m) => m.DibayCallScreen)),
  { ssr: false, loading: () => <CommunityMessengerCallRouteLoading /> }
);

/**
 * 통화 화면 — call-v3 ON: DibayCallScreen / OFF: CommunityMessengerCallClient
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

  if (isCallV3Enabled()) {
    return <DibayCallScreen sessionId={sessionId} />;
  }

  if (hostOwnsSession) {
    return null;
  }

  return <CommunityMessengerCallClient key={sessionId} sessionId={sessionId} initialSession={null} />;
}
