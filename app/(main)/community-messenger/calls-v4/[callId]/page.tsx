"use client";

import { Suspense, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CommunityMessengerCallRouteLoading } from "@/components/community-messenger/CommunityMessengerCallRouteLoading";
import { CallV4Screen } from "@/components/community-messenger/call-v4/CallV4Screen";
import { peekNativeOwnedWebV4UiBlockSync } from "@/lib/call/native/native-owned-web-v4-ui-guard";
import { assertDibayCallLaneExclusive } from "@/lib/community-messenger/call-v4/call-v4-lane";
import { logCallV4 } from "@/lib/community-messenger/call-v4/call-v4-debug";

function CallV4ScreenRoute() {
  const params = useParams();
  const searchParams = useSearchParams();
  const raw = params?.callId;
  const callId = Array.isArray(raw) ? String(raw[0] ?? "").trim() : String(raw ?? "").trim();
  const action = searchParams?.get("action")?.trim() ?? null;
  const syncBlocked = peekNativeOwnedWebV4UiBlockSync(callId);

  useEffect(() => {
    if (!callId) return;
    logCallV4("calls_v4_page_entry", { callId });
    logCallV4("calls_v4_page_params", { callId, action });
  }, [action, callId]);

  useEffect(() => {
    if (!callId || !syncBlocked) return;
    logCallV4("web_v4_screen_mount_blocked", { callId, trigger: "calls_v4_page_sync" });
  }, [callId, syncBlocked]);

  if (!callId) return <CommunityMessengerCallRouteLoading />;
  if (syncBlocked) return null;
  return <CallV4Screen callId={callId} />;
}

export default function CommunityMessengerCallV4Page() {
  useEffect(() => {
    assertDibayCallLaneExclusive();
    logCallV4("calls_v4_page_loaded", {});
  }, []);

  return (
    <Suspense fallback={<CommunityMessengerCallRouteLoading />}>
      <CallV4ScreenRoute />
    </Suspense>
  );
}
