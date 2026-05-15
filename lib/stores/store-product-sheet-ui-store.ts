"use client";

import { create } from "zustand";
import { dibayPerfRecordMenuItemOpenIntent } from "@/lib/dibay/delivery-flow-perf";
import {
  DELIVERY_PERF_TAG_OPTION_SHEET,
  deliveryPerfTraceLog,
} from "@/lib/dibay/delivery-perf-trace";
import type { StoreDetailLike } from "@/lib/stores/store-public-page-hydrate";

export type StoreProductSheetStoreContext = {
  store: StoreDetailLike;
  favoriteCount: number;
  recentOrderCount: number;
};

export type OpenStoreProductSheetPayload = {
  productId: string;
  pageStoreSlug: string;
  prefetchedListRow?: Record<string, unknown> | null;
  sheetStoreContext?: StoreProductSheetStoreContext | null;
  commerceBlocked?: boolean;
  commerceBlockedHint?: string;
};

type SheetUiState = {
  productId: string | null;
  pageStoreSlug: string;
  prefetchedListRow: Record<string, unknown> | null;
  sheetStoreContext: StoreProductSheetStoreContext | null;
  commerceBlocked: boolean;
  commerceBlockedHint?: string;
  openSheet: (payload: OpenStoreProductSheetPayload) => void;
  closeSheet: () => void;
};

const CLOSED: Pick<
  SheetUiState,
  "productId" | "pageStoreSlug" | "prefetchedListRow" | "sheetStoreContext" | "commerceBlocked" | "commerceBlockedHint"
> = {
  productId: null,
  pageStoreSlug: "",
  prefetchedListRow: null,
  sheetStoreContext: null,
  commerceBlocked: false,
  commerceBlockedHint: undefined,
};

let sheetOpenMark = 0;

export function getStoreProductSheetOpenMark(): number {
  return sheetOpenMark;
}

export const useStoreProductSheetUIStore = create<SheetUiState>((set) => ({
  ...CLOSED,
  openSheet: (payload) => {
    const productId = String(payload.productId ?? "").trim();
    if (!productId) return;
    sheetOpenMark = typeof performance !== "undefined" ? performance.now() : Date.now();
    dibayPerfRecordMenuItemOpenIntent();
    deliveryPerfTraceLog(DELIVERY_PERF_TAG_OPTION_SHEET, {
      event: "sheet_open_dispatch",
      product_id: productId,
      pass: 0,
    });
    set({
      productId,
      pageStoreSlug: payload.pageStoreSlug,
      prefetchedListRow: payload.prefetchedListRow ?? null,
      sheetStoreContext: payload.sheetStoreContext ?? null,
      commerceBlocked: payload.commerceBlocked === true,
      commerceBlockedHint: payload.commerceBlockedHint,
    });
  },
  closeSheet: () => set({ ...CLOSED }),
}));

export function openStoreProductSheet(payload: OpenStoreProductSheetPayload): void {
  useStoreProductSheetUIStore.getState().openSheet(payload);
}

export function closeStoreProductSheet(): void {
  useStoreProductSheetUIStore.getState().closeSheet();
}

export function selectStoreProductSheetIsOpen(s: SheetUiState): boolean {
  return s.productId != null;
}
