"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { CommunityMessengerCallRouteLoading } from "@/components/community-messenger/CommunityMessengerCallRouteLoading";
import { CallV4Screen } from "@/components/community-messenger/call-v4/CallV4Screen";
import { assertDibayCallLaneExclusive } from "@/lib/community-messenger/call-v4/call-v4-lane";
import { useEffect } from "react";

function CallV4ScreenRoute() {
  const params = useParams();
  const raw = params?.callId;
  const callId = Array.isArray(raw) ? String(raw[0] ?? "").trim() : String(raw ?? "").trim();
  if (!callId) return <CommunityMessengerCallRouteLoading />;
  return <CallV4Screen callId={callId} />;
}

export default function CommunityMessengerCallV4Page() {
  useEffect(() => {
    assertDibayCallLaneExclusive();
  }, []);

  return (
    <Suspense fallback={<CommunityMessengerCallRouteLoading />}>
      <CallV4ScreenRoute />
    </Suspense>
  );
}
