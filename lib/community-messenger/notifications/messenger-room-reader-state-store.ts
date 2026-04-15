"use client";

import { create } from "zustand";
import type { MessengerChatViewPosition } from "./messenger-notification-state-model";

type RoomReaderEntry = {
  scrollPosition: MessengerChatViewPosition;
  pendingNewBelow: number;
  updatedAt: number;
};

type State = {
  byRoom: Record<string, RoomReaderEntry>;
  setScrollPosition: (roomId: string, position: MessengerChatViewPosition) => void;
  bumpPendingNewFromOthers: (roomId: string, delta: number) => void;
  clearPendingNew: (roomId: string) => void;
  clearRoom: (roomId: string) => void;
  getScrollPositionForPolicy: (roomId: string) => MessengerChatViewPosition | null;
};

const STICKY_POSITIONS: MessengerChatViewPosition[] = ["at-bottom", "near-bottom"];

export const useMessengerRoomReaderStateStore = create<State>((set, get) => ({
  byRoom: {},
  setScrollPosition: (roomId, position) => {
    const id = roomId.trim();
    if (!id) return;
    set((s) => {
      const prev = s.byRoom[id];
      const pending = STICKY_POSITIONS.includes(position) ? 0 : prev?.pendingNewBelow ?? 0;
      return {
        byRoom: {
          ...s.byRoom,
          [id]: { scrollPosition: position, pendingNewBelow: pending, updatedAt: Date.now() },
        },
      };
    });
  },
  bumpPendingNewFromOthers: (roomId, delta) => {
    const id = roomId.trim();
    if (!id || delta <= 0) return;
    set((s) => {
      const prev = s.byRoom[id];
      return {
        byRoom: {
          ...s.byRoom,
          [id]: {
            scrollPosition: "reading-history",
            pendingNewBelow: (prev?.pendingNewBelow ?? 0) + delta,
            updatedAt: Date.now(),
          },
        },
      };
    });
  },
  clearPendingNew: (roomId) => {
    const id = roomId.trim();
    if (!id) return;
    set((s) => {
      const prev = s.byRoom[id];
      if (!prev) return s;
      return {
        byRoom: {
          ...s.byRoom,
          [id]: { ...prev, pendingNewBelow: 0, updatedAt: Date.now() },
        },
      };
    });
  },
  clearRoom: (roomId) => {
    const id = roomId.trim();
    if (!id) return;
    set((s) => {
      const next = { ...s.byRoom };
      delete next[id];
      return { byRoom: next };
    });
  },
  getScrollPositionForPolicy: (roomId) => get().byRoom[roomId.trim()]?.scrollPosition ?? null,
}));
