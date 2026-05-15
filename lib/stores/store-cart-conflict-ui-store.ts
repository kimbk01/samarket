"use client";

import { create } from "zustand";
import type { AddStoreCartLineInput } from "@/lib/stores/store-commerce-cart-types";
import {
  DELIVERY_PERF_TAG_CART_PATCH,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";

type CartConflictUiState = {
  open: boolean;
  pendingLine: AddStoreCartLineInput | null;
  onResolved: (() => void) | null;
  openConflict: (line: AddStoreCartLineInput, onResolved?: () => void) => void;
  closeConflict: () => void;
};

let conflictOpenMark = 0;

export function getStoreCartConflictOpenMark(): number {
  return conflictOpenMark;
}

export const useStoreCartConflictUIStore = create<CartConflictUiState>((set) => ({
  open: false,
  pendingLine: null,
  onResolved: null,
  openConflict: (line, onResolved) => {
    conflictOpenMark = typeof performance !== "undefined" ? performance.now() : Date.now();
    deliveryPerfTraceLog(DELIVERY_PERF_TAG_CART_PATCH, {
      event: "cart_conflict_open_dispatch",
      store_id: line.storeId,
      next_store_id: line.storeId,
    });
    set({ open: true, pendingLine: line, onResolved: onResolved ?? null });
  },
  closeConflict: () => set({ open: false, pendingLine: null, onResolved: null }),
}));

export function openStoreCartConflict(
  line: AddStoreCartLineInput,
  onResolved?: () => void
): void {
  useStoreCartConflictUIStore.getState().openConflict(line, onResolved);
}

export function closeStoreCartConflict(): void {
  useStoreCartConflictUIStore.getState().closeConflict();
}
