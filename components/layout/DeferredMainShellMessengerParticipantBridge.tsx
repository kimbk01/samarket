"use client";

import { useEffect, useState } from "react";
import { MainShellMessengerParticipantBridge } from "@/components/layout/MainShellMessengerParticipantBridge";

/**
 * Stage 3 — participants Realtime 은 first paint 이후 rAF 1회에 연결 (idle 3s blackout 금지).
 * Sound 는 이 브리지에 의존하지 않는다. Badge unread 만 담당.
 * `MainShellMessengerParticipantBridge` 단일 인스턴스 계약 유지.
 */
export function DeferredMainShellMessengerParticipantBridge({
  regionBarInLayout = true,
}: {
  regionBarInLayout?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const arm = () => {
      if (!cancelled) setArmed(true);
    };
    const id = window.requestAnimationFrame(() => {
      arm();
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
    };
  }, []);

  if (!armed) return null;
  return <MainShellMessengerParticipantBridge regionBarInLayout={regionBarInLayout} />;
}
