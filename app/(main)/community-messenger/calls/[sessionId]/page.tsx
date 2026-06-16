"use client";

import dynamic from "next/dynamic";
import { useEffect, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { CommunityMessengerCallClient } from "@/components/community-messenger/CommunityMessengerCallClient";
import { CommunityMessengerCallRouteLoading } from "@/components/community-messenger/CommunityMessengerCallRouteLoading";
import { subscribeCommunityCallHostSync } from "@/components/layout/providers/CommunityMessengerActiveCallHost";
import { isCallSessionHostedByActiveCallHost } from "@/lib/community-messenger/direct-call-minimize";
import { isCallV3Enabled, logCallV3FeatureFlag } from "@/lib/call-v3/call-v3-feature-flag";
import { logCallV3 } from "@/lib/call-v3/call-v3-log";
import { useCallV3ClientReady } from "@/lib/call-v3/use-call-v3-client-ready";
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
  const clientReady = useCallV3ClientReady();
  const v3Enabled = clientReady && isCallV3Enabled();

  useEffect(() => {
    if (!clientReady) return;
    logCallV3FeatureFlag("CommunityMessengerCallPage");
    if (!sessionId) return;
    if (v3Enabled) {
      logCallV3("page_mounted", { screen: "DibayCallScreen", sessionId });
      logCallV3("legacy_blocked_when_v3_enabled", { surface: "CommunityMessengerCallPage", sessionId });
      return;
    }
    logCallV3("page_mounted", {
      screen: hostOwnsSession ? "null_host_owns" : "CommunityMessengerCallClient",
      sessionId,
      hostOwnsSession,
    });
  }, [clientReady, hostOwnsSession, sessionId, v3Enabled]);

  if (!sessionId || !clientReady) {
    return <CommunityMessengerCallRouteLoading />;
  }

  if (v3Enabled) {
    return <DibayCallScreen sessionId={sessionId} />;
  }

  if (hostOwnsSession) {
    return null;
  }

  return <CommunityMessengerCallClient key={sessionId} sessionId={sessionId} initialSession={null} />;
}
