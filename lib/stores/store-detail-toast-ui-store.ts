"use client";

import { create } from "zustand";

type ToastUiState = {
  message: string | null;
  storeId: string | null;
  openedAt: number;
  showToast: (storeId: string, message: string) => void;
  hideToast: () => void;
};

let toastOpenMark = 0;
let lastToastDedupeKey = "";
let lastToastDedupeAt = 0;
const TOAST_DEDUPE_MS = 2200;

/** 매장 id 없이 장바구니 정책(만료 등) 안내 */
export const STORE_COMMERCE_POLICY_TOAST_STORE_ID = "__commerce_cart_policy__";

export function getStoreDetailToastOpenMark(): number {
  return toastOpenMark;
}

export const useStoreDetailToastUIStore = create<ToastUiState>((set, get) => ({
  message: null,
  storeId: null,
  openedAt: 0,
  showToast: (storeId, message) => {
    const sid = storeId.trim();
    const msg = message.trim();
    if (!sid || !msg) return;
    const dedupeKey = `${sid}::${msg}`;
    const now = Date.now();
    if (dedupeKey === lastToastDedupeKey && now - lastToastDedupeAt < TOAST_DEDUPE_MS) {
      /** S2-16 — 같은 문구 재요청: 새 토스트는 띄우지 않되 표시 중이면 자동 숨김 타이머를 다시 시작 */
      const cur = get();
      if (cur.message === msg && cur.storeId === sid) set({ openedAt: now });
      return;
    }
    lastToastDedupeKey = dedupeKey;
    lastToastDedupeAt = now;
    toastOpenMark = typeof performance !== "undefined" ? performance.now() : Date.now();
    set({ message: msg, storeId: sid, openedAt: now });
  },
  hideToast: () => set({ message: null, storeId: null, openedAt: 0 }),
}));

export function showStoreDetailToast(storeId: string, message: string): void {
  useStoreDetailToastUIStore.getState().showToast(storeId, message);
}

export function showCommerceCartPolicyToast(message: string): void {
  useStoreDetailToastUIStore
    .getState()
    .showToast(STORE_COMMERCE_POLICY_TOAST_STORE_ID, message);
}

export function hideStoreDetailToast(): void {
  useStoreDetailToastUIStore.getState().hideToast();
}
