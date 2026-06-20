"use client";

import { useEffect, useState } from "react";
import { MainShellMessengerParticipantBridge } from "@/components/layout/MainShellMessengerParticipantBridge";

/**
 * Stage 3 — participants Realtime 은 home shell paint 이후 idle 에 연결.
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
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(arm, { timeout: 3000 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }
    const t = window.setTimeout(arm, 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, []);

  if (!armed) return null;
  return <MainShellMessengerParticipantBridge regionBarInLayout={regionBarInLayout} />;
}
