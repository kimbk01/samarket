"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { assertDibayCallLaneExclusive } from "@/lib/community-messenger/call-v4/call-v4-lane";

type CallV4ScreenProps = {
  callId: string;
};

export default function CommunityMessengerCallV4Page() {
  const params = useParams();
  const raw = params?.callId;
  const callId = Array.isArray(raw) ? String(raw[0] ?? "").trim() : String(raw ?? "").trim();
  const [Screen, setScreen] = useState<ComponentType<CallV4ScreenProps> | null>(null);

  useEffect(() => {
    assertDibayCallLaneExclusive();
  }, []);

  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    void import("@/components/community-messenger/call-v4/CallV4Screen").then((mod) => {
      if (!cancelled) setScreen(() => mod.CallV4Screen);
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
