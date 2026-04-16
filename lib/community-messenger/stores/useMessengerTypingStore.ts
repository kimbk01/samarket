"use client";

import { create } from "zustand";

type TypingEntry = {
  roomId: string;
  userId: string;
  expiresAt: number;
};

type TypingState = {
  byRoomId: Record<string, Record<string, TypingEntry>>;
  setTyping: (roomId: string, userId: string, ttlMs: number) => void;
  clearTyping: (roomId: string, userId: string) => void;
  clearExpired: (now?: number) => void;
};

export const useMessengerTypingStore = create<TypingState>((set) => ({
  byRoomId: {},
  setTyping: (roomId, userId, ttlMs) =>
    set((state) => {
      const rid = String(roomId ?? "").trim().toLowerCase();
      const uid = String(userId ?? "").trim();
      if (!rid || !uid) return state;
      const room = state.byRoomId[rid] ?? {};
      return {
        byRoomId: {
          ...state.byRoomId,
          [rid]: {
            ...room,
            [uid]: {
              roomId: rid,
              userId: uid,
              expiresAt: Date.now() + Math.max(500, ttlMs),
            },
          },
        },
      };
    }),
  clearTyping: (roomId, userId) =>
    set((state) => {
      const rid = String(roomId ?? "").trim().toLowerCase();
      const uid = String(userId ?? "").trim();
      if (!rid || !uid) return state;
      const room = { ...(state.byRoomId[rid] ?? {}) };
      delete room[uid];
      return {
        byRoomId: {
          ...state.byRoomId,
          [rid]: room,
        },
      };
    }),
  clearExpired: (now = Date.now()) =>
    set((state) => {
      const next: Record<string, Record<string, TypingEntry>> = {};
      for (const [roomId, entries] of Object.entries(state.byRoomId)) {
        const kept = Object.fromEntries(Object.entries(entries).filter(([, entry]) => entry.expiresAt > now));
        next[roomId] = kept;
      }
      return { byRoomId: next };
    }),
}));
