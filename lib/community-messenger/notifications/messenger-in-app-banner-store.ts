"use client";

import { create } from "zustand";

export type MessengerInAppMessageBanner = {
  roomId: string;
  title: string;
  preview: string;
  count: number;
  updatedAt: number;
  dedupeKey: string;
};

type State = {
  banner: MessengerInAppMessageBanner | null;
  pushOrMerge: (b: Omit<MessengerInAppMessageBanner, "count" | "updatedAt"> & { count?: number }) => void;
  dismiss: () => void;
};

export const useMessengerInAppMessageBannerStore = create<State>((set, get) => ({
  banner: null,
  pushOrMerge: (b) => {
    const prev = get().banner;
    const now = Date.now();
    if (prev && prev.roomId === b.roomId) {
      const nextCount = typeof b.count === "number" ? b.count : prev.count + 1;
      set({
        banner: {
          ...prev,
          title: b.title || prev.title,
          preview: b.preview || prev.preview,
          count: nextCount,
          updatedAt: now,
          dedupeKey: b.dedupeKey,
        },
      });
      return;
    }
    set({
      banner: {
        roomId: b.roomId,
        title: b.title,
        preview: b.preview,
        count: Math.max(1, b.count ?? 1),
        updatedAt: now,
        dedupeKey: b.dedupeKey,
      },
    });
  },
  dismiss: () => set({ banner: null }),
}));
