"use client";

import {
  DELIVERY_PERF_TAG_CART_CONFLICT_OPEN_MS,
  DELIVERY_PERF_TAG_CART_DELETE_MS,
  DELIVERY_PERF_TAG_CART_OPTIMISTIC_MS,
  DELIVERY_PERF_TAG_CART_PATCH,
  DELIVERY_PERF_TAG_CART_QTY_PATCH_MS,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";

let seq = 0;

function rounded(ms: number): number {
  return Math.max(0, Math.round(ms));
}

function nextKey(kind: string, storeId: string): string {
  seq += 1;
  return `${kind}:${storeId}:${seq}`;
}

type CartTraceBase = {
  store_id: string;
  line_id?: string;
  product_id?: string;
  qty?: number;
};

export function traceDeliveryCartOptimisticMs(
  valueMs: number,
  base: CartTraceBase,
  extra?: Record<string, unknown>
): void {
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_CART_OPTIMISTIC_MS, {
    event: "cart_optimistic_ms",
    event_key: nextKey("optimistic", base.store_id),
    value_ms: rounded(valueMs),
    ...base,
    ...extra,
  });
}

export function traceDeliveryCartQtyPatchMs(
  valueMs: number,
  base: CartTraceBase,
  extra?: Record<string, unknown>
): void {
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_CART_QTY_PATCH_MS, {
    event: "cart_qty_patch_ms",
    event_key: nextKey("qty", base.store_id),
    value_ms: rounded(valueMs),
    ...base,
    ...extra,
  });
}

export function traceDeliveryCartDeleteMs(
  valueMs: number,
  base: CartTraceBase,
  extra?: Record<string, unknown>
): void {
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_CART_DELETE_MS, {
    event: "cart_delete_ms",
    event_key: nextKey("delete", base.store_id),
    value_ms: rounded(valueMs),
    ...base,
    ...extra,
  });
}

export function traceDeliveryCartConflictOpenMs(
  valueMs: number,
  base: { store_id: string; next_store_id?: string },
  extra?: Record<string, unknown>
): void {
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_CART_CONFLICT_OPEN_MS, {
    event: "cart_conflict_open_ms",
    event_key: nextKey("conflict", base.store_id),
    value_ms: rounded(valueMs),
    ...base,
    ...extra,
  });
}

export function traceDeliveryCartRollback(
  base: CartTraceBase,
  reason: string,
  extra?: Record<string, unknown>
): void {
  deliveryPerfTraceLog(DELIVERY_PERF_TAG_CART_PATCH, {
    event: "cart_rollback",
    event_key: nextKey("rollback", base.store_id),
    reason,
    ...base,
    ...extra,
  });
}
