"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { useTradeActivityCoordinator } from "@/lib/chats/use-trade-activity-coordinator";
import { useTradeMultiTabVisibilityOr } from "@/lib/chats/use-trade-multi-tab-visibility-or";
import { TRADE_PRESENCE_HEARTBEAT_INTERVAL_MS } from "@/lib/chats/trade-presence-policy";

export type TradePresenceActivityContextValue = {
  getLastActivityAtMs: () => number;
  aggregatedTabVisible: boolean;
};

const TradePresenceActivityContext = createContext<TradePresenceActivityContextValue | null>(null);

export function useTradePresenceActivityOptional(): TradePresenceActivityContextValue | null {
  return useContext(TradePresenceActivityContext);
}

/**
 * 로그인 시 앱 전역 거래 presence 용 활동·멀티탭 가시성 + heartbeat.
 */
export function TradePresenceActivityProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const enabled = !!userId?.trim();
  const { getLastActivityAtMs } = useTradeActivityCoordinator(enabled);
  const aggregatedTabVisible = useTradeMultiTabVisibilityOr(enabled);

  const value = useMemo<TradePresenceActivityContextValue>(
    () => ({
      getLastActivityAtMs,
      aggregatedTabVisible,
    }),
    [getLastActivityAtMs, aggregatedTabVisible]
  );

  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      const id = await getCurrentUserIdForDb();
      if (cancelled) return;
      setUserId(id?.trim() ? id : null);
    };
    void sync();
    const sb = getSupabaseClient();
    const sub =
      sb?.auth.onAuthStateChange(() => {
        void sync();
      })?.data.subscription ?? null;
    return () => {
      cancelled = true;
      sub?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      void (async () => {
        try {
          await fetch("/api/me/trade-presence/heartbeat", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
        } catch {
          /* ignore */
        }
      })();
    };
    tick();
    const id = window.setInterval(tick, TRADE_PRESENCE_HEARTBEAT_INTERVAL_MS);
    const flushBeacon = () => {
      try {
        const blob = new Blob([JSON.stringify({ kind: "page_hidden" })], { type: "application/json" });
        navigator.sendBeacon("/api/me/trade-presence/beacon", blob);
      } catch {
        /* ignore */
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flushBeacon();
    };
    const onPageHide = () => flushBeacon();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [enabled]);

  return (
    <TradePresenceActivityContext.Provider value={enabled ? value : null}>
      {children}
    </TradePresenceActivityContext.Provider>
  );
}
