"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { dvDeliveryLatencyLog, dvDeliveryLatencyValue } from "@/lib/perf/dv-delivery-latency";

export type StoreOrdersRealtimeHandlers = {
  debounceMs?: number;
  /** INSERT / UPDATE / DELETE 후 목록·카운트 동기화 (트레일링 디바운스) */
  onChange?: () => void;
  /** INSERT 전용 — 배달 신규 주문 알림음 등 */
  onInsert?: (row: Record<string, unknown>) => void;
};

/**
 * 해당 매장 `store_orders` 행 변경 시 콜백 (RLS: 오너는 본인 매장 행만 수신).
 * INSERT·UPDATE·DELETE 모두 구독한다.
 */
export function useSupabaseStoreOrdersRealtime(
  storeId: string | null,
  handlers: StoreOrdersRealtimeHandlers
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const sid = storeId?.trim() ?? "";
    if (!sid) return;

    const sb = getSupabaseClient();
    if (!sb) return;

    let ch: RealtimeChannel | null = null;
    let cancelled = false;
    let debTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSig = "";
    let lastSigAt = 0;

    const clearDebounce = () => {
      if (debTimer) {
        clearTimeout(debTimer);
        debTimer = null;
      }
    };

    const scheduleChange = () => {
      const ms = handlersRef.current.debounceMs ?? 380;
      clearDebounce();
      debTimer = setTimeout(() => {
        debTimer = null;
        handlersRef.current.onChange?.();
      }, ms);
    };

    const subscribe = () => {
      if (cancelled) return;
      if (ch) void sb.removeChannel(ch);
      clearDebounce();
      ch = sb
        .channel(`store-orders-rt:${sid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "store_orders",
            filter: `store_id=eq.${sid}`,
          },
          (payload) => {
            try {
              const commitTs = (payload as any)?.commit_timestamp;
              const sig = `${String(payload.eventType)}:${String(commitTs ?? "")}`;
              const now = Date.now();
              if (sig && sig === lastSig && now - lastSigAt < 1500) {
                dvDeliveryLatencyLog("duplicate_realtime_event_ms", {
                  table: "store_orders",
                  scope: "owner_store",
                  eventType: payload.eventType,
                  commit_timestamp: commitTs,
                  store_id: sid,
                });
              }
              lastSig = sig;
              lastSigAt = now;
              const commitMs = typeof commitTs === "string" ? new Date(commitTs).getTime() : NaN;
              if (Number.isFinite(commitMs)) {
                dvDeliveryLatencyValue("owner_realtime_received_ms", Date.now() - commitMs, {
                  table: "store_orders",
                  eventType: payload.eventType,
                  commit_timestamp: commitTs,
                  store_id: sid,
                });
              } else {
                dvDeliveryLatencyLog("owner_realtime_received_ms", {
                  table: "store_orders",
                  eventType: payload.eventType,
                  store_id: sid,
                });
              }
            } catch {
              /* ignore */
            }
            const eventType = payload.eventType;
            if (eventType === "INSERT") {
              const row = payload.new as Record<string, unknown> | null;
              if (row && typeof row === "object") {
                handlersRef.current.onInsert?.(row);
              }
            }
            if (eventType === "INSERT" || eventType === "UPDATE" || eventType === "DELETE") {
              scheduleChange();
            }
          }
        )
        .subscribe();
    };

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        clearDebounce();
        if (ch) void sb.removeChannel(ch);
        ch = null;
        return;
      }
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
        if (session?.user) subscribe();
      }
    });

    return () => {
      cancelled = true;
      clearDebounce();
      subscription.unsubscribe();
      if (ch) void sb.removeChannel(ch);
    };
  }, [storeId]);
}
