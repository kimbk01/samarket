"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CommunityMessengerPeerPresenceSnapshot } from "@/lib/community-messenger/types";
import { messengerMonitorRecord } from "@/lib/community-messenger/monitoring/client";
import { fetchCommunityMessengerPresenceSnapshotsBatchClient } from "@/lib/community-messenger/realtime/presence/fetch-community-messenger-presence-snapshot-client";
import { isCommunityMessengerRealtimeScopeHealthy } from "@/lib/community-messenger/realtime/community-messenger-realtime-health";
import { useMessengerPresenceStore } from "@/lib/community-messenger/stores/useMessengerPresenceStore";
import { isCmRoomEntryPriorityModeActive } from "@/lib/community-messenger/room/cm-room-entry-priority-mode";
import {
  createPresenceSnapshotPollScheduler,
  type PresenceSnapshotPollScheduler,
} from "@/lib/community-messenger/realtime/presence/presence-snapshot-poll-scheduler";
import { resolvePresenceStateWithStaleness } from "@/lib/community-messenger/presence/presence-staleness";

const PRESENCE_RUNTIME_SCOPE = "community-messenger:presence-runtime";
/** Realtime 정상 중 online 표시 재평가 주기(realtime 단절 감지용) — 폴링 스케줄러 주기와 동일 */
const PRESENCE_HEALTHY_RECHECK_MS = 12_000;

let pollScheduler: PresenceSnapshotPollScheduler | null = null;

/**
 * Realtime presence 가 unhealthy 인 동안 화면의 모든 피어 id 를 한 스케줄러로 묶어 배치 폴링.
 * `updatedAt` 은 서버 `lastSeenAt`(세션 종료 시각일 수 있음)이 아니라 **관측(수신) 시각** — 신선도 판정 기준.
 */
function getPresenceSnapshotPollScheduler(): PresenceSnapshotPollScheduler {
  if (pollScheduler) return pollScheduler;
  const scheduler = createPresenceSnapshotPollScheduler({
    fetchBatch: (ids) => fetchCommunityMessengerPresenceSnapshotsBatchClient(ids),
    apply: (snapshots, { observedAtMs, elapsedMs }) => {
      const observedAtIso = new Date(observedAtMs).toISOString();
      useMessengerPresenceStore.setState((state) => {
        const byUserId = { ...state.byUserId };
        for (const [userId, snap] of snapshots) {
          const prev = byUserId[userId];
          byUserId[userId] = {
            userId,
            state: snap.state,
            lastSeenAt: snap.lastSeenAt ?? prev?.lastSeenAt ?? null,
            updatedAt: observedAtIso,
          };
        }
        return { byUserId };
      });
      messengerMonitorRecord({
        category: "realtime.subscription",
        metric: "presence_snapshot_fallback",
        value: Math.round(elapsedMs),
        unit: "ms",
        labels: { scope: PRESENCE_RUNTIME_SCOPE, batchSize: String(snapshots.size) },
      });
    },
    isRealtimeHealthy: () => isCommunityMessengerRealtimeScopeHealthy(PRESENCE_RUNTIME_SCOPE),
    isDeferred: () => isCmRoomEntryPriorityModeActive(),
    isDocumentVisible: () => typeof document === "undefined" || document.visibilityState === "visible",
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduler.notifyVisible();
    });
  }
  pollScheduler = scheduler;
  return scheduler;
}

export function useCommunityMessengerPeerPresence(
  userId: string | null | undefined,
  fallback?: CommunityMessengerPeerPresenceSnapshot | null
): CommunityMessengerPeerPresenceSnapshot | null {
  const id = typeof userId === "string" ? userId.trim() : "";
  /** 전체 `byUserId` 엔트리가 아닌 표시용 primitive 만 구독 — `replacePresenceMap` 시 무관 행 리렌더 방지 */
  const liveState = useMessengerPresenceStore((state) => (id ? state.byUserId[id]?.state ?? null : null));
  const liveUpdatedAt = useMessengerPresenceStore((state) => (id ? state.byUserId[id]?.updatedAt ?? null : null));
  useEffect(() => {
    if (!id) return;
    return getPresenceSnapshotPollScheduler().subscribe(id);
  }, [id]);
  /** online 관측이 policy 창을 넘기는 시점에 재평가하기 위한 tick */
  const [stalenessTick, setStalenessTick] = useState(0);
  const resolved = useMemo(() => {
    if (!liveState) return null;
    /**
     * Realtime 정상 시: presence join/leave 가 권위 — 신선도 강등을 적용하지 않는다
     * (track payload 의 updatedAt 은 상대 기기 시계라 시계 오차로 정상 online 이 away 로 보일 수 있음).
     * 이 경우 realtime 이 끊기는 순간을 놓치지 않도록 주기적으로 재평가만 예약한다.
     */
    if (isCommunityMessengerRealtimeScopeHealthy(PRESENCE_RUNTIME_SCOPE)) {
      return {
        state: liveState,
        nextChangeAtMs: liveState === "online" ? Date.now() + PRESENCE_HEALTHY_RECHECK_MS : null,
      };
    }
    return resolvePresenceStateWithStaleness({ state: liveState, updatedAtIso: liveUpdatedAt, nowMs: Date.now() });
    // stalenessTick: 시간 경과 재평가 트리거
  }, [liveState, liveUpdatedAt, stalenessTick]);
  const nextChangeAtMs = resolved?.nextChangeAtMs ?? null;
  useEffect(() => {
    if (nextChangeAtMs == null) return;
    const t = setTimeout(() => setStalenessTick((n) => n + 1), Math.max(0, nextChangeAtMs - Date.now()));
    return () => clearTimeout(t);
  }, [nextChangeAtMs]);
  const displayState = resolved?.state ?? null;
  const snapshotStableRef = useRef<CommunityMessengerPeerPresenceSnapshot | null>(null);
  return useMemo(() => {
    if (!id) return null;
    if (displayState) {
      const prev = snapshotStableRef.current;
      if (prev && prev.userId === id && prev.state === displayState) return prev;
      const next: CommunityMessengerPeerPresenceSnapshot = {
        userId: id,
        state: displayState,
        lastSeenAt: fallback?.lastSeenAt ?? null,
      };
      snapshotStableRef.current = next;
      return next;
    }
    if (!fallback) return null;
    return fallback;
  }, [fallback, id, displayState]);
}
