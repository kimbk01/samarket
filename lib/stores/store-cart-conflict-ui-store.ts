"use client";

import { create } from "zustand";
import type { AddStoreCartLineInput } from "@/lib/stores/store-commerce-cart-types";
import type {
  StoreCartConflictExisting,
  StoreCartConflictTarget,
} from "@/lib/stores/store-cart-conflict-meta";
import { traceCommerceCart } from "@/lib/stores/store-commerce-cart-trace";
import {
  DELIVERY_PERF_TAG_CART_PATCH,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";

export type StoreCartConflictMode = "line" | "bulk_clear" | null;

type CartConflictUiState = {
  open: boolean;
  mode: StoreCartConflictMode;
  pendingLine: AddStoreCartLineInput | null;
  existing: StoreCartConflictExisting | null;
  target: StoreCartConflictTarget | null;
  onResolved: (() => void) | null;
  bulkClearResolve: ((confirmed: boolean) => void) | null;
  openConflict: (
    line: AddStoreCartLineInput,
    existing: StoreCartConflictExisting,
    onResolved?: () => void
  ) => void;
  openBulkClear: (
    existing: StoreCartConflictExisting,
    target: StoreCartConflictTarget | null
  ) => void;
  closeConflict: () => void;
};

let conflictOpenMark = 0;

export function getStoreCartConflictOpenMark(): number {
  return conflictOpenMark;
}

function finishBulkResolve(resolve: ((confirmed: boolean) => void) | null, confirmed: boolean) {
  if (resolve) resolve(confirmed);
}

export const useStoreCartConflictUIStore = create<CartConflictUiState>((set, get) => ({
  open: false,
  mode: null,
  pendingLine: null,
  existing: null,
  target: null,
  onResolved: null,
  bulkClearResolve: null,
  openConflict: (line, existing, onResolved) => {
    const cur = get();
    if (
      cur.open &&
      cur.mode === "line" &&
      cur.pendingLine?.storeId === line.storeId &&
      cur.pendingLine?.productId === line.productId
    ) {
      traceCommerceCart("conflict_dedupe", {
        store_id: line.storeId,
        product_id: line.productId,
      });
      return;
    }
    conflictOpenMark = typeof performance !== "undefined" ? performance.now() : Date.now();
    deliveryPerfTraceLog(DELIVERY_PERF_TAG_CART_PATCH, {
      event: "cart_conflict_open_dispatch",
      store_id: existing.storeId,
      next_store_id: line.storeId,
    });
    traceCommerceCart("conflict_open_line", {
      store_id: line.storeId,
      product_id: line.productId,
    });
    set({
      open: true,
      mode: "line",
      pendingLine: line,
      existing,
      target: {
        storeId: line.storeId,
        storeSlug: line.storeSlug,
        storeName: line.storeName,
      },
      onResolved: onResolved ?? null,
      bulkClearResolve: null,
    });
  },
  openBulkClear: (existing, target) => {
    conflictOpenMark = typeof performance !== "undefined" ? performance.now() : Date.now();
    traceCommerceCart("conflict_open_bulk", { store_id: existing.storeId });
    set({
      open: true,
      mode: "bulk_clear",
      pendingLine: null,
      existing,
      target,
      onResolved: null,
    });
  },
  closeConflict: () => {
    const cur = get();
    finishBulkResolve(cur.bulkClearResolve, false);
    if (cur.open) {
      traceCommerceCart("conflict_cancel", { mode: cur.mode ?? "unknown" });
    }
    set({
      open: false,
      mode: null,
      pendingLine: null,
      existing: null,
      target: null,
      onResolved: null,
      bulkClearResolve: null,
    });
  },
}));

export function openStoreCartConflict(
  line: AddStoreCartLineInput,
  existing: StoreCartConflictExisting,
  onResolved?: () => void
): void {
  useStoreCartConflictUIStore.getState().openConflict(line, existing, onResolved);
}

export function closeStoreCartConflict(): void {
  useStoreCartConflictUIStore.getState().closeConflict();
}

/** 재주문 — 동일 conflict dialog */
export function requestStoreCartBulkClearReplace(
  existing: StoreCartConflictExisting,
  target: StoreCartConflictTarget | null
): Promise<boolean> {
  return new Promise((resolve) => {
    const cur = useStoreCartConflictUIStore.getState();
    if (cur.open && cur.mode === "bulk_clear") {
      traceCommerceCart("conflict_bulk_dedupe", {});
      resolve(false);
      return;
    }
    useStoreCartConflictUIStore.setState({
      bulkClearResolve: resolve,
    });
    useStoreCartConflictUIStore.getState().openBulkClear(existing, target);
  });
}

export function resolveStoreCartBulkClearConfirmed(): void {
  const cur = useStoreCartConflictUIStore.getState();
  finishBulkResolve(cur.bulkClearResolve, true);
  traceCommerceCart("conflict_bulk_confirm", {});
  useStoreCartConflictUIStore.setState({
    open: false,
    mode: null,
    pendingLine: null,
    existing: null,
    target: null,
    onResolved: null,
    bulkClearResolve: null,
  });
}
