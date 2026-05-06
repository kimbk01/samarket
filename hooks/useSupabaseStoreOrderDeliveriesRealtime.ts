"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";

export type StoreOrderDeliveriesRealtimeHandlers = {
  debounceMs?: number;
  onChange?: () => void;
};

/**
 * store_order_deliveries 변경 구독 (INSERT/UPDATE/DELETE)
 * - onChange는 트레일링 디바운스로 묶는다.
 */
export function useSupabaseStoreOrderDeliveriesRealtime(
  scope: { kind: "order"; orderId: string } | { kind: "store"; storeId: string } | null,
  handlers: StoreOrderDeliveriesRealtimeHandlers
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!scope) return;
    const key = scope.kind === "order" ? scope.orderId.trim() : scope.storeId.trim();
    if (!key) return;

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
      const ms = handlersRef.current.debounceMs ?? 420;
      clearDebounce();
      debTimer = setTimeout(() => {
        debTimer = null;
        handlersRef.current.onChange?.();
      }, ms);
    };

    const filter =
      scope.kind === "order"
        ? `order_id=eq.${key}`
        : `store_id=eq.${key}`;

    const subscribe = () => {
      if (cancelled) return;
      if (ch) void sb.removeChannel(ch);
      clearDebounce();
      ch = sb
        .channel(`store-order-deliveries-rt:${scope.kind}:${key}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "store_order_deliveries",
            filter,
          },
          (payload) => {
            const t = payload.eventType;
            if (t === "INSERT" || t === "UPDATE" || t === "DELETE") scheduleChange();
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
  }, [scope?.kind, (scope as any)?.orderId, (scope as any)?.storeId]);
}

