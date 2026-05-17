"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  dibayPerfRecordOrderCreatedToOwnerVisible,
  dibayPerfRecordOwnerOrderRealtimeInsertReceived,
  dibayPerfRecordOwnerOrderRealtimeUpdateReceived,
  dibayPerfRecordOwnerOrderRowPatched,
} from "@/lib/dibay/delivery-flow-perf";
import {
  mapRealtimeRecordToOwnerOrder,
  mergeRealtimeRecordIntoOwnerOrder,
} from "@/lib/store-owner/map-realtime-store-order-to-owner";
import type { OwnerOrder } from "@/lib/store-owner/types";
import { r2d1OwnerOrdersTrace } from "@/lib/dibay/r2-d1-owner-orders-trace";
import { getSupabaseClient } from "@/lib/supabase/client";

export function sortOwnerOrdersDesc(list: OwnerOrder[]): OwnerOrder[] {
  return [...list].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export type UseOwnerStoreOrdersRealtimeOpts = {
  storeId: string | null;
  storeSlug: string;
  storeName: string;
  enabled: boolean;
  debounceUpdateMs?: number;
  setOrders: Dispatch<SetStateAction<OwnerOrder[]>>;
  /** 품목 등 목록에 부족한 필드 보강 — 목록 전체 재조회 금지 */
  requestOrderEnrich: (orderId: string) => void;
  onRealtimeInsert?: (orderId: string, record: Record<string, unknown>) => void;
};

/**
 * 오너 매장 단일 `store_id` 범위의 `store_orders` Realtime — INSERT 선반영, UPDATE 디바운스 패치.
 */
export function useOwnerStoreOrdersRealtime(opts: UseOwnerStoreOrdersRealtimeOpts): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const pendingUpdatesRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sid = opts.storeId?.trim() ?? "";
    if (!sid || !opts.enabled) return;

    const sb = getSupabaseClient();
    if (!sb) return;

    let ch: RealtimeChannel | null = null;
    let cancelled = false;

    const clearFlush = () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    };

    const flushUpdates = () => {
      clearFlush();
      const batch = [...pendingUpdatesRef.current.entries()];
      pendingUpdatesRef.current = new Map();
      if (batch.length === 0) return;

      const { setOrders } = optsRef.current;
      setOrders((prev) => {
        const beforeCount = prev.length;
        const copy = [...prev];
        let changed = false;
        for (const [id, row] of batch) {
          const idx = copy.findIndex((o) => o.id === id);
          if (idx < 0) continue;
          const merged = mergeRealtimeRecordIntoOwnerOrder(copy[idx]!, row);
          if (merged !== copy[idx]) {
            copy[idx] = merged;
            changed = true;
            dibayPerfRecordOwnerOrderRowPatched(sid, id);
            r2d1OwnerOrdersTrace({
              kind: "row_patch_update",
              source: "useOwnerStoreOrdersRealtime.flushUpdates",
              owner: "useOwnerStoreOrdersRealtime",
              storeId: sid,
              orderId: id,
              fetchReason: "realtime_update_batch",
              beforeCount,
              afterCount: changed ? copy.length : beforeCount,
            });
            r2d1OwnerOrdersTrace({
              kind: "full_reload_blocked",
              source: "useOwnerStoreOrdersRealtime.flushUpdates",
              owner: "useOwnerStoreOrdersRealtime",
              storeId: sid,
              orderId: id,
              fetchReason: "orders_realtime_row_patch",
            });
          }
        }
        return changed ? sortOwnerOrdersDesc(copy) : prev;
      });
    };

    const scheduleFlushUpdates = () => {
      const ms = optsRef.current.debounceUpdateMs ?? 130;
      clearFlush();
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        flushUpdates();
      }, ms);
    };

    const subscribe = () => {
      if (cancelled) return;
      if (ch) void sb.removeChannel(ch);
      clearFlush();
      pendingUpdatesRef.current.clear();

      ch = sb
        .channel(`owner-store-orders-rt:${sid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "store_orders",
            filter: `store_id=eq.${sid}`,
          },
          (payload) => {
            const { storeSlug, storeName, setOrders, requestOrderEnrich, onRealtimeInsert } =
              optsRef.current;
            const ctx = { storeId: sid, storeSlug, storeName };
            const rtOrderId =
              payload.new && typeof payload.new === "object" && "id" in payload.new
                ? String((payload.new as { id?: unknown }).id ?? "").trim()
                : payload.old && typeof payload.old === "object" && "id" in payload.old
                  ? String((payload.old as { id?: unknown }).id ?? "").trim()
                  : undefined;
            r2d1OwnerOrdersTrace({
              kind: "realtime_event",
              source: "useOwnerStoreOrdersRealtime",
              owner: "useOwnerStoreOrdersRealtime",
              storeId: sid,
              orderId: rtOrderId || undefined,
              eventType: payload.eventType,
              fetchReason: "postgres_changes",
            });

            if (payload.eventType === "INSERT") {
              const row = payload.new as Record<string, unknown> | null;
              if (!row || typeof row !== "object") return;
              const id = String(row.id ?? "").trim();
              if (!id) return;
              dibayPerfRecordOwnerOrderRealtimeInsertReceived(sid, id);
              const lite = mapRealtimeRecordToOwnerOrder(row, ctx);
              if (!lite) return;

              let didInsert = false;
              setOrders((prev) => {
                if (prev.some((o) => o.id === id)) return prev;
                didInsert = true;
                const next = sortOwnerOrdersDesc([lite, ...prev]);
                r2d1OwnerOrdersTrace({
                  kind: "row_patch_insert",
                  source: "useOwnerStoreOrdersRealtime",
                  owner: "useOwnerStoreOrdersRealtime",
                  storeId: sid,
                  orderId: id,
                  fetchReason: "realtime_insert",
                  beforeCount: prev.length,
                  afterCount: next.length,
                });
                r2d1OwnerOrdersTrace({
                  kind: "full_reload_blocked",
                  source: "useOwnerStoreOrdersRealtime",
                  owner: "useOwnerStoreOrdersRealtime",
                  storeId: sid,
                  orderId: id,
                  fetchReason: "orders_realtime_row_patch",
                });
                return next;
              });
              if (didInsert) {
                dibayPerfRecordOrderCreatedToOwnerVisible(sid, id);
                onRealtimeInsert?.(id, row);
                requestOrderEnrich(id);
              }
              return;
            }

            if (payload.eventType === "UPDATE") {
              const row = payload.new as Record<string, unknown> | null;
              if (!row || typeof row !== "object") return;
              const id = String(row.id ?? "").trim();
              if (!id) return;
              dibayPerfRecordOwnerOrderRealtimeUpdateReceived(sid, id);
              pendingUpdatesRef.current.set(id, row);
              scheduleFlushUpdates();
              return;
            }

            if (payload.eventType === "DELETE") {
              const oldRow = payload.old as Record<string, unknown> | null;
              const id = oldRow?.id != null ? String(oldRow.id).trim() : "";
              if (!id) return;
              setOrders((prev) => {
                if (!prev.some((o) => o.id === id)) return prev;
                dibayPerfRecordOwnerOrderRowPatched(sid, id);
                const next = prev.filter((o) => o.id !== id);
                r2d1OwnerOrdersTrace({
                  kind: "row_patch_remove",
                  source: "useOwnerStoreOrdersRealtime",
                  owner: "useOwnerStoreOrdersRealtime",
                  storeId: sid,
                  orderId: id,
                  fetchReason: "realtime_delete",
                  beforeCount: prev.length,
                  afterCount: next.length,
                });
                r2d1OwnerOrdersTrace({
                  kind: "full_reload_blocked",
                  source: "useOwnerStoreOrdersRealtime",
                  owner: "useOwnerStoreOrdersRealtime",
                  storeId: sid,
                  orderId: id,
                  fetchReason: "orders_realtime_row_patch",
                });
                return next;
              });
            }
          }
        )
        .subscribe();
      r2d1OwnerOrdersTrace({
        kind: "listener_attach",
        source: "useOwnerStoreOrdersRealtime.subscribe",
        owner: "useOwnerStoreOrdersRealtime",
        storeId: sid,
        fetchReason: `channel:owner-store-orders-rt:${sid}`,
      });
    };

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "SIGNED_OUT") {
        clearFlush();
        pendingUpdatesRef.current.clear();
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
      clearFlush();
      pendingUpdatesRef.current.clear();
      subscription.unsubscribe();
      if (ch) {
        r2d1OwnerOrdersTrace({
          kind: "listener_detach",
          source: "useOwnerStoreOrdersRealtime.cleanup",
          owner: "useOwnerStoreOrdersRealtime",
          storeId: sid,
          fetchReason: `channel:owner-store-orders-rt:${sid}`,
        });
        void sb.removeChannel(ch);
      }
    };
  }, [opts.storeId, opts.enabled]);
}
