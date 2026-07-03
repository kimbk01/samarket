"use client";

import { Suspense, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CommunityMessengerCallRouteLoading } from "@/components/community-messenger/CommunityMessengerCallRouteLoading";
import { CallV4Screen } from "@/components/community-messenger/call-v4/CallV4Screen";
import { isLegacyWebCallEstablishmentRemoved } from "@/lib/call/native/legacy-web-call-establishment-removed";
import { assertDibayCallLaneExclusive } from "@/lib/community-messenger/call-v4/call-v4-lane";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";
import { isCallV4OutgoingPresentationSource } from "@/lib/community-messenger/call-v4/call-v4-route";

function CallV4RouteSuspenseFallback() {
  if (typeof window === "undefined") {
    return <CommunityMessengerCallRouteLoading />;
  }
  try {
    const source = new URLSearchParams(window.location.search).get("source");
    if (isCallV4OutgoingPresentationSource(source)) return null;
  } catch {
    /* noop */
  }
  return <CommunityMessengerCallRouteLoading />;
}

function CallV4ScreenRoute() {
  const params = useParams();
  const searchParams = useSearchParams();
  const raw = params?.callId;
  const callId = Array.isArray(raw) ? String(raw[0] ?? "").trim() : String(raw ?? "").trim();
  const action = searchParams?.get("action")?.trim() ?? null;
  const source = searchParams?.get("source")?.trim() ?? null;
  const establishmentRemoved = isLegacyWebCallEstablishmentRemoved();
  const outgoingPresentation = isCallV4OutgoingPresentationSource(source);

  useEffect(() => {
    if (!callId) return;
    logCallV4("calls_v4_page_entry", { callId });
    logCallV4("calls_v4_page_params", { callId, action, source });
    if (establishmentRemoved && !outgoingPresentation) {
      logCallV4("legacy_web_establishment_removed", { callId, trigger: "calls_v4_page" });
    }
  }, [action, callId, establishmentRemoved, outgoingPresentation, source]);

  if (!callId) return <CommunityMessengerCallRouteLoading />;
  if (establishmentRemoved && !outgoingPresentation) return null;
  return <CallV4Screen callId={callId} />;
}

export default function CommunityMessengerCallV4Page() {
  useEffect(() => {
    assertDibayCallLaneExclusive();
    logCallV4("calls_v4_page_loaded", {});
  }, []);

  return (
    <Suspense fallback={<CallV4RouteSuspenseFallback />}>
      <CallV4ScreenRoute />
    </Suspense>
  );
}
