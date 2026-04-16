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
  replacePresenceMap: (next) => set({ byUserId: next }),
}));
