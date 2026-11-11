"use client";

import { useEffect, useState, type ReactNode } from "react";
import { TradePresenceActivityProvider } from "@/components/chats/TradePresenceActivityContext";

/**
 * Stage 3 — trade presence heartbeat 는 home visible 이후 idle.
 * D1 R2: 유휴 전후로 감싸는 요소를 바꾸지 않는다(예전 `<>{children}</>` → Provider 교체가 시작 1.2~1.7초 뒤 앱 셸 전체를
 * 다시 만들었다 — 2026-11-12 운영 확인). Provider 는 항상 감싸고 `armed` 만 넘긴다.
 */
export function DeferredTradePresenceActivityProvider({ children }: { children: ReactNode }) {
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

  return <TradePresenceActivityProvider armed={armed}>{children}</TradePresenceActivityProvider>;
}
