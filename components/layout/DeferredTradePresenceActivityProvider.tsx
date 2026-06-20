"use client";

import { useEffect, useState, type ReactNode } from "react";
import { TradePresenceActivityProvider } from "@/components/chats/TradePresenceActivityContext";

/** Stage 3 — trade presence heartbeat 는 home visible 이후 idle. */
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

  if (!armed) return <>{children}</>;
  return <TradePresenceActivityProvider>{children}</TradePresenceActivityProvider>;
}
