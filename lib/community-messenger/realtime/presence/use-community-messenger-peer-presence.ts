"use client";

import { useMemo } from "react";
import type { CommunityMessengerPeerPresenceSnapshot } from "@/lib/community-messenger/types";
import { useMessengerPresenceStore } from "@/lib/community-messenger/stores/useMessengerPresenceStore";

export function useCommunityMessengerPeerPresence(
  userId: string | null | undefined,
  fallback?: CommunityMessengerPeerPresenceSnapshot | null
): CommunityMessengerPeerPresenceSnapshot | null {
  const id = typeof userId === "string" ? userId.trim() : "";
  const live = useMessengerPresenceStore((state) => (id ? state.byUserId[id] ?? null : null));
  return useMemo(() => {
    if (!id) return null;
    if (live) {
      return {
        userId: id,
        state: live.state,
        lastSeenAt: live.lastSeenAt ?? fallback?.lastSeenAt ?? null,
      };
    }
    if (!fallback) return null;
    return fallback;
  }, [fallback, id, live]);
}
