"use client";

import { create } from "zustand";
import type { CommunityMessengerPeerPresenceSnapshot, CommunityMessengerPresenceState } from "@/lib/community-messenger/types";

type PresenceEntry = CommunityMessengerPeerPresenceSnapshot & {
  updatedAt: string | null;
};

type PresenceState = {
  byUserId: Record<string, PresenceEntry>;
  upsertPresence: (
    userId: string,
    patch: {
      state: CommunityMessengerPresenceState;
      lastSeenAt?: string | null;
      updatedAt?: string | null;
    }
  ) => void;
  replacePresenceMap: (next: Record<string, PresenceEntry>) => void;
};

export const useMessengerPresenceStore = create<PresenceState>((set) => ({
  byUserId: {},
  upsertPresence: (userId, patch) =>
    set((state) => {
      const id = String(userId ?? "").trim();
      if (!id) return state;
      const prev = state.byUserId[id];
      return {
        byUserId: {
          ...state.byUserId,
          [id]: {
            userId: id,
            state: patch.state,
            lastSeenAt: patch.lastSeenAt ?? prev?.lastSeenAt ?? null,
            updatedAt: patch.updatedAt ?? prev?.updatedAt ?? null,
          },
        },
      };
    }),
  replacePresenceMap: (incoming) =>
    set((state) => {
      const prev = state.byUserId;
      let changed = false;
      const merged: Record<string, PresenceEntry> = {};
      for (const [id, entry] of Object.entries(incoming)) {
        const old = prev[id];
        if (
          old &&
          old.state === entry.state &&
          old.lastSeenAt === entry.lastSeenAt &&
          old.updatedAt === entry.updatedAt
        ) {
          merged[id] = old;
        } else {
          merged[id] = entry;
          changed = true;
        }
      }
      if (Object.keys(prev).length !== Object.keys(incoming).length) {
        changed = true;
      }
      if (!changed) return state;
      return { byUserId: merged };
    }),
}));
