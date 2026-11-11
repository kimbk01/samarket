"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase/client";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { useTradeActivityCoordinator } from "@/lib/chats/use-trade-activity-coordinator";
import { useTradeMultiTabVisibilityOr } from "@/lib/chats/use-trade-multi-tab-visibility-or";
import { TRADE_PRESENCE_HEARTBEAT_INTERVAL_MS } from "@/lib/chats/trade-presence-policy";
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";
import {
  shouldRunTradePresenceHttpHeartbeat,
  TRADE_PRESENCE_HEARTBEAT_SUPPRESSED_TAIL_MS,
} from "@/lib/chats/trade-presence-heartbeat-surface-policy";
import { useSamarketTabLeader } from "@/lib/runtime/leader-tab-coordinator";
import { samarketRuntimeDebugLog } from "@/lib/runtime/samarket-runtime-debug";
import { runSingleFlight } from "@/lib/http/run-single-flight";

const TRADE_PRESENCE_HTTP_LEADER_SCOPE = "trade-presence-http-post";

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
 *
 * D1 R2 (Owner 승인 2026-11-12 · `docs/audit/d1-remaining-items-design-2026-11-12.md` §2):
 * Provider 는 처음부터 children 을 감싸고(감싸는 요소 종류 고정 — 바뀌면 앱 셸 전체가 다시 만들어짐),
 * 실제 동작(로그인 확인·활동·멀티탭·heartbeat)은 `armed` 뒤에 children 의 **형제**로 붙는 엔진에서만 돈다.
 * 값은 엔진이 알려 줄 때까지 `null`(예전 「Provider 없음」과 같음 — 소비처 `useTradePresenceActivityOptional` 은 null 처리).
 */
export function TradePresenceActivityProvider({
  children,
  armed = true,
}: {
  children: ReactNode;
  armed?: boolean;
}) {
  const [value, setValue] = useState<TradePresenceActivityContextValue | null>(null);
  return (
    <TradePresenceActivityContext.Provider value={armed ? value : null}>
      {armed ? <TradePresenceActivityEngine onValue={setValue} /> : null}
      {children}
    </TradePresenceActivityContext.Provider>
  );
}

function TradePresenceActivityEngine({
  onValue,
}: {
  onValue: (value: TradePresenceActivityContextValue | null) => void;
}) {
  const pathname = usePathname();
  const pathnameRef = useRef<string | null>(null);
  pathnameRef.current = pathname ?? null;
  const isLeaderTab = useSamarketTabLeader(TRADE_PRESENCE_HTTP_LEADER_SCOPE);
  const isLeaderTabRef = useRef(isLeaderTab);
  isLeaderTabRef.current = isLeaderTab;
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

  // deps 에 `pathname` 을 넣지 않음 — `pathnameRef` 로만 읽어 라우트 전환마다 타이머·리스너를 재생성하지 않음
  useEffect(() => {
    if (!enabled || isDevSafeMode()) return;
    const postHeartbeat = () => {
      void (async () => {
        try {
          await runSingleFlight("me:trade-presence:heartbeat:post", () =>
            fetch("/api/me/trade-presence/heartbeat", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: "{}",
            })
          );
        } catch {
          /* ignore */
        }
      })();
    };
    let pollTimer: number | null = null;
    let cancelled = false;
    const schedulePoll = () => {
      if (cancelled) return;
      const allow = shouldRunTradePresenceHttpHeartbeat(pathnameRef.current);
      const ms = allow ? TRADE_PRESENCE_HEARTBEAT_INTERVAL_MS : TRADE_PRESENCE_HEARTBEAT_SUPPRESSED_TAIL_MS;
      pollTimer = window.setTimeout(() => {
        pollTimer = null;
        if (cancelled) return;
        if (
          isLeaderTabRef.current &&
          shouldRunTradePresenceHttpHeartbeat(pathnameRef.current)
        ) {
          samarketRuntimeDebugLog("trade-presence", "leader heartbeat POST", {
            path: pathnameRef.current ?? null,
          });
          postHeartbeat();
        }
        schedulePoll();
      }, ms);
    };
    if (
      isLeaderTabRef.current &&
      shouldRunTradePresenceHttpHeartbeat(pathnameRef.current)
    ) {
      postHeartbeat();
    }
    schedulePoll();
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
      cancelled = true;
      if (pollTimer != null) window.clearTimeout(pollTimer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [enabled, isLeaderTab]);

  const published = enabled ? value : null;
  useEffect(() => {
    onValue(published);
  }, [onValue, published]);
  useEffect(() => () => onValue(null), [onValue]);

  return null;
}
