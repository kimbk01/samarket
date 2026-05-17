"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { r2d1OwnerOrdersTrace } from "@/lib/dibay/r2-d1-owner-orders-trace";
import { getSupabaseClient } from "@/lib/supabase/client";

export type StoreOrderDeliveryRealtimeEvent = {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  orderId: string;
  newRow: Record<string, unknown> | null;
  oldRow: Record<string, unknown> | null;
};

export type StoreOrderDeliveriesRealtimeHandlers = {
  debounceMs?: number;
  /** 레거시 — 전체 목록 reload 등 */
  onChange?: () => void;
  /** 행 단위 delivery patch (호출 시 onChange 스케줄 생략) */
  onDeliveryEvent?: (event: StoreOrderDeliveryRealtimeEvent) => void;
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
            const newRow =
              payload.new && typeof payload.new === "object"
                ? (payload.new as Record<string, unknown>)
                : null;
            const oldRow =
              payload.old && typeof payload.old === "object"
                ? (payload.old as Record<string, unknown>)
                : null;
            const orderId =
              newRow?.order_id != null
                ? String(newRow.order_id).trim()
                : oldRow?.order_id != null
                  ? String(oldRow.order_id).trim()
                  : "";
            r2d1OwnerOrdersTrace({
              kind: "delivery_realtime_event",
              source: "useSupabaseStoreOrderDeliveriesRealtime",
              owner: "useSupabaseStoreOrderDeliveriesRealtime",
              storeId: scope.kind === "store" ? key : undefined,
              orderId: orderId || undefined,
              deliveryId: orderId || undefined,
              eventType: t,
              fetchReason: "postgres_changes",
            });
            if (t === "INSERT" || t === "UPDATE" || t === "DELETE") {
              if (orderId && handlersRef.current.onDeliveryEvent) {
                handlersRef.current.onDeliveryEvent({
                  eventType: t,
                  orderId,
                  newRow,
                  oldRow,
                });
                return;
              }
              scheduleChange();
            }
          }
        )
        .subscribe();
      r2d1OwnerOrdersTrace({
        kind: "listener_attach",
        source: "useSupabaseStoreOrderDeliveriesRealtime.subscribe",
        owner: "useSupabaseStoreOrderDeliveriesRealtime",
        storeId: scope.kind === "store" ? key : undefined,
        fetchReason: `channel:store-order-deliveries-rt:${scope.kind}:${key}`,
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
          source: "useSupabaseStoreOrderDeliveriesRealtime.cleanup",
          owner: "useSupabaseStoreOrderDeliveriesRealtime",
          storeId: scope.kind === "store" ? key : undefined,
          fetchReason: `channel:store-order-deliveries-rt:${scope.kind}:${key}`,
        });
        void sb.removeChannel(ch);
      }
    };
  }, [scope?.kind, (scope as any)?.orderId, (scope as any)?.storeId]);
}

