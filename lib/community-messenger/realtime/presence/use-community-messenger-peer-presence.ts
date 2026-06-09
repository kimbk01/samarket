"use client";

import { useEffect, useMemo, useRef } from "react";
import type { CommunityMessengerPeerPresenceSnapshot } from "@/lib/community-messenger/types";
import { messengerMonitorRecord } from "@/lib/community-messenger/monitoring/client";
import { fetchCommunityMessengerPresenceSnapshotClient } from "@/lib/community-messenger/realtime/presence/fetch-community-messenger-presence-snapshot-client";
import { isCommunityMessengerRealtimeScopeHealthy } from "@/lib/community-messenger/realtime/community-messenger-realtime-health";
import { useMessengerPresenceStore } from "@/lib/community-messenger/stores/useMessengerPresenceStore";
import { isCmRoomEntryPriorityModeActive } from "@/lib/community-messenger/room/cm-room-entry-priority-mode";

const PRESENCE_RUNTIME_SCOPE = "community-messenger:presence-runtime";

export function useCommunityMessengerPeerPresence(
  userId: string | null | undefined,
  fallback?: CommunityMessengerPeerPresenceSnapshot | null
): CommunityMessengerPeerPresenceSnapshot | null {
  const id = typeof userId === "string" ? userId.trim() : "";
  /** 전체 `byUserId` 엔트리가 아닌 표시용 state primitive 만 구독 — `replacePresenceMap` 시 무관 행 리렌더 방지 */
  const liveState = useMessengerPresenceStore((state) => (id ? state.byUserId[id]?.state ?? null : null));
  useEffect(() => {
    if (!id) return;
    if (isCommunityMessengerRealtimeScopeHealthy(PRESENCE_RUNTIME_SCOPE)) return;
    let cancelled = false;
    const runFetch = () => {
      if (cancelled || isCmRoomEntryPriorityModeActive()) return;
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
    };
    if (isCmRoomEntryPriorityModeActive()) {
      const deferMs = 1500;
      const t = window.setTimeout(runFetch, deferMs);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }
    runFetch();
    return () => {
      cancelled = true;
    };
  }, [id]);
  const snapshotStableRef = useRef<CommunityMessengerPeerPresenceSnapshot | null>(null);
  return useMemo(() => {
    if (!id) return null;
    if (liveState) {
      const prev = snapshotStableRef.current;
      if (prev && prev.userId === id && prev.state === liveState) return prev;
      const next: CommunityMessengerPeerPresenceSnapshot = {
        userId: id,
        state: liveState,
        lastSeenAt: fallback?.lastSeenAt ?? null,
      };
      snapshotStableRef.current = next;
      return next;
    }
    if (!fallback) return null;
    return fallback;
  }, [fallback, id, liveState]);
}
