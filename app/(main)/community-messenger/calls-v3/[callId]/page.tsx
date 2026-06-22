"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";

type CallV3ScreenProps = {
  callId: string;
};

/**
 * Agora SDK는 SSR 번들에서 `window` 참조로 500을 낸다.
 * `next/dynamic({ ssr: false })`만으로는 Turbopack SSR 청크에 섞일 수 있어
 * 클라이언트 마운트 후에만 CallV3Screen 청크를 로드한다.
 */
export default function CommunityMessengerCallV3Page() {
  const params = useParams();
  const raw = params?.callId;
  const callId = Array.isArray(raw) ? String(raw[0] ?? "").trim() : String(raw ?? "").trim();
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
