"use client";

import { useEffect, useMemo } from "react";
import type { CommunityMessengerPeerPresenceSnapshot } from "@/lib/community-messenger/types";
import { messengerMonitorRecord } from "@/lib/community-messenger/monitoring/client";
import { fetchCommunityMessengerPresenceSnapshotClient } from "@/lib/community-messenger/realtime/presence/fetch-community-messenger-presence-snapshot-client";
import { isCommunityMessengerRealtimeScopeHealthy } from "@/lib/community-messenger/realtime/community-messenger-realtime-health";
import { useMessengerPresenceStore } from "@/lib/community-messenger/stores/useMessengerPresenceStore";

const PRESENCE_RUNTIME_SCOPE = "community-messenger:presence-runtime";

export function useCommunityMessengerPeerPresence(
  userId: string | null | undefined,
  fallback?: CommunityMessengerPeerPresenceSnapshot | null
): CommunityMessengerPeerPresenceSnapshot | null {
  const id = typeof userId === "string" ? userId.trim() : "";
  const live = useMessengerPresenceStore((state) => (id ? state.byUserId[id] ?? null : null));
  useEffect(() => {
    if (!id) return;
    if (isCommunityMessengerRealtimeScopeHealthy(PRESENCE_RUNTIME_SCOPE)) return;
    let cancelled = false;
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    void fetchCommunityMessengerPresenceSnapshotClient(id).then((snapshot) => {
      if (cancelled || !snapshot) return;
      const elapsed = typeof performance !== "undefined" ? Math.round(performance.now() - t0) : 0;
      messengerMonitorRecord({
        category: "realtime.subscription",
        metric: "presence_snapshot_fallback",
        value: elapsed,
        unit: "ms",
        labels: { scope: PRESENCE_RUNTIME_SCOPE, userIdSuffix: id.slice(-8) },
      });
      useMessengerPresenceStore.getState().upsertPresence(id, {
        state: snapshot.state,
        lastSeenAt: snapshot.lastSeenAt ?? null,
        updatedAt: snapshot.lastSeenAt ?? null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [id]);
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
