"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { StoreOrdersRealtimeHandlers } from "@/hooks/useSupabaseStoreOrdersRealtime";

/**
 * 단일 주문 행 `store_orders` 변경 구독 — 구매자 상세·관리자 상세 등.
 * RLS 범위 내에서만 이벤트 수신.
 */
export function useSupabaseStoreOrderRowRealtime(
  orderId: string | null,
  handlers: Pick<StoreOrdersRealtimeHandlers, "debounceMs" | "onChange">
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const oid = orderId?.trim() ?? "";
    if (!oid) return;

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
        .channel(`store-order-row-rt:${oid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "store_orders",
            filter: `id=eq.${oid}`,
          },
          (payload) => {
            const eventType = payload.eventType;
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
  }, [orderId]);
}
