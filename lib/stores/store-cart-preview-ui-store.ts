"use client";

import { create } from "zustand";
import {
  DELIVERY_PERF_TAG_CART_PATCH,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";

type CartPreviewUiState = {
  open: boolean;
  storeId: string;
  storeSlug: string;
  openPreview: (payload: { storeId: string; storeSlug: string }) => void;
  closePreview: () => void;
};

let previewOpenMark = 0;

export function getStoreCartPreviewOpenMark(): number {
  return previewOpenMark;
}

export const useStoreCartPreviewUIStore = create<CartPreviewUiState>((set) => ({
  open: false,
  storeId: "",
  storeSlug: "",
  openPreview: (payload) => {
    const storeId = String(payload.storeId ?? "").trim();
    const storeSlug = String(payload.storeSlug ?? "").trim();
    if (!storeId || !storeSlug) return;
    previewOpenMark = typeof performance !== "undefined" ? performance.now() : Date.now();
    deliveryPerfTraceLog(DELIVERY_PERF_TAG_CART_PATCH, {
      event: "cart_preview_open_dispatch",
      store_id: storeId,
    });
    set({ open: true, storeId, storeSlug });
  },
  closePreview: () => set({ open: false, storeId: "", storeSlug: "" }),
}));

export function openStoreCartPreview(payload: { storeId: string; storeSlug: string }): void {
  useStoreCartPreviewUIStore.getState().openPreview(payload);
}

export function closeStoreCartPreview(): void {
  useStoreCartPreviewUIStore.getState().closePreview();
}

export function selectStoreCartPreviewIsOpen(s: CartPreviewUiState): boolean {
  return s.open;
}
