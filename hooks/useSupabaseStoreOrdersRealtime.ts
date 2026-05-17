"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { r2d1OwnerOrdersTrace } from "@/lib/dibay/r2-d1-owner-orders-trace";
import { getSupabaseClient } from "@/lib/supabase/client";

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
            const eventType = payload.eventType;
            const orderId =
              payload.new && typeof payload.new === "object" && "id" in payload.new
                ? String((payload.new as { id?: unknown }).id ?? "").trim()
                : payload.old && typeof payload.old === "object" && "id" in payload.old
                  ? String((payload.old as { id?: unknown }).id ?? "").trim()
                  : undefined;
            r2d1OwnerOrdersTrace({
              kind: "realtime_event",
              source: "useSupabaseStoreOrdersRealtime",
              owner: "useSupabaseStoreOrdersRealtime",
              storeId: sid,
              orderId: orderId || undefined,
              eventType,
              fetchReason: "postgres_changes",
            });
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
      r2d1OwnerOrdersTrace({
        kind: "listener_attach",
        source: "useSupabaseStoreOrdersRealtime.subscribe",
        owner: "useSupabaseStoreOrdersRealtime",
        storeId: sid,
        fetchReason: `channel:store-orders-rt:${sid}`,
      });
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
      if (ch) {
        r2d1OwnerOrdersTrace({
          kind: "listener_detach",
          source: "useSupabaseStoreOrdersRealtime.cleanup",
          owner: "useSupabaseStoreOrdersRealtime",
          storeId: sid,
          fetchReason: `channel:store-orders-rt:${sid}`,
        });
        void sb.removeChannel(ch);
      }
    };
  }, [storeId]);
}
