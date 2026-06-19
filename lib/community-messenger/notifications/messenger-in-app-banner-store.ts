"use client";

import { create } from "zustand";
import type { MessageNotificationPreviewKind } from "@/lib/notifications/display/build-message-notification-display";
import type { NotificationMessageRoomKind } from "@/lib/notifications/core/notification-event-types";

export type MessengerInAppMessageBanner = {
  roomId: string;
  title: string;
  preview: string;
  count: number;
  updatedAt: number;
  dedupeKey: string;
  senderName?: string | null;
  senderAvatarUrl?: string | null;
  roomKind?: NotificationMessageRoomKind | null;
  contextLabel?: string | null;
  previewKind?: MessageNotificationPreviewKind | null;
  routeUrl?: string;
};

type PushInput = Omit<MessengerInAppMessageBanner, "count" | "updatedAt"> & { count?: number };

type State = {
  banner: MessengerInAppMessageBanner | null;
  pushOrMerge: (b: PushInput) => void;
  dismiss: () => void;
};

function mergeBannerFields(prev: MessengerInAppMessageBanner, next: PushInput): MessengerInAppMessageBanner {
  return {
    ...prev,
    title: next.title || prev.title,
    preview: next.preview || prev.preview,
    dedupeKey: next.dedupeKey,
    senderName: next.senderName ?? prev.senderName ?? null,
    senderAvatarUrl: next.senderAvatarUrl ?? prev.senderAvatarUrl ?? null,
    roomKind: next.roomKind ?? prev.roomKind ?? null,
    contextLabel: next.contextLabel ?? prev.contextLabel ?? null,
    previewKind: next.previewKind ?? prev.previewKind ?? null,
    routeUrl: next.routeUrl || prev.routeUrl,
  };
}

export const useMessengerInAppMessageBannerStore = create<State>((set, get) => ({
  banner: null,
  pushOrMerge: (b) => {
    const prev = get().banner;
    const now = Date.now();
    if (prev && prev.roomId === b.roomId) {
      const nextCount = typeof b.count === "number" ? b.count : prev.count + 1;
      set({
        banner: {
          ...mergeBannerFields(prev, b),
          count: nextCount,
          updatedAt: now,
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
        senderName: b.senderName ?? null,
        senderAvatarUrl: b.senderAvatarUrl ?? null,
        roomKind: b.roomKind ?? null,
        contextLabel: b.contextLabel ?? null,
        previewKind: b.previewKind ?? null,
        routeUrl: b.routeUrl,
      },
    });
  },
  dismiss: () => set({ banner: null }),
}));
