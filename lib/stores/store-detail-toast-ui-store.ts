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

export function getStoreDetailToastOpenMark(): number {
  return toastOpenMark;
}

export const useStoreDetailToastUIStore = create<ToastUiState>((set) => ({
  message: null,
  storeId: null,
  openedAt: 0,
  showToast: (storeId, message) => {
    const sid = storeId.trim();
    const msg = message.trim();
    if (!sid || !msg) return;
    toastOpenMark = typeof performance !== "undefined" ? performance.now() : Date.now();
    set({ message: msg, storeId: sid, openedAt: Date.now() });
  },
  hideToast: () => set({ message: null, storeId: null, openedAt: 0 }),
}));

export function showStoreDetailToast(storeId: string, message: string): void {
  useStoreDetailToastUIStore.getState().showToast(storeId, message);
}

export function hideStoreDetailToast(): void {
  useStoreDetailToastUIStore.getState().hideToast();
}
