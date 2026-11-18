"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CommunityMessengerPeerPresenceSnapshot } from "@/lib/community-messenger/types";
import { messengerMonitorRecord } from "@/lib/community-messenger/monitoring/client";
import { fetchCommunityMessengerPresenceSnapshotsBatchClient } from "@/lib/community-messenger/realtime/presence/fetch-community-messenger-presence-snapshot-client";
import { useMessengerPresenceStore } from "@/lib/community-messenger/stores/useMessengerPresenceStore";
import { isCmRoomEntryPriorityModeActive } from "@/lib/community-messenger/room/cm-room-entry-priority-mode";
import {
  createPresenceSnapshotPollScheduler,
  type PresenceSnapshotPollScheduler,
} from "@/lib/community-messenger/realtime/presence/presence-snapshot-poll-scheduler";
import { resolvePresenceStateWithStaleness } from "@/lib/community-messenger/presence/presence-staleness";
import { normalizeLegacyPresenceState } from "@/lib/community-messenger/presence/presence-policy";
import { mergePresenceSnapshotsIntoStoreMap } from "@/lib/community-messenger/realtime/presence/merge-presence-snapshots";
import { acquireCommunityMessengerPresenceUserBroadcast } from "@/lib/community-messenger/realtime/presence/presence-user-broadcast-client";

const PRESENCE_SNAPSHOT_MONITOR_SCOPE = "community-messenger:presence-snapshot";

let pollScheduler: PresenceSnapshotPollScheduler | null = null;

/**
 * D1 2단계 — 화면의 상대 id 를 한 스케줄러로 묶어 **첫 값 1회** 배치 조회하고,
 * 온라인으로 보이는 상대만 판정 창(150s) 만료 전에 재확인한다(오프라인 상대는 재조회 없음).
 * 전역 presence 채널(접속자 N² 전파)은 없다. 1:1 머리글은 `live` 옵션으로 사용자별 토픽을 구독한다.
 * `updatedAt` 은 서버 `lastSeenAt`(세션 종료 시각일 수 있음)이 아니라 **관측(수신) 시각** — 신선도 판정 기준.
 */
function getPresenceSnapshotPollScheduler(): PresenceSnapshotPollScheduler {
  if (pollScheduler) return pollScheduler;
  const scheduler = createPresenceSnapshotPollScheduler({
    fetchBatch: (ids) => fetchCommunityMessengerPresenceSnapshotsBatchClient(ids),
    apply: (snapshots, { observedAtMs, elapsedMs, initial }) => {
      const observedAtIso = new Date(observedAtMs).toISOString();
      /** 첫 값(실시간 정상 중)은 없는 id 만 채운다 — 실시간 값을 덮지 않음 (2026-11-16 감사 F1) */
      useMessengerPresenceStore.setState((state) => ({
        byUserId: mergePresenceSnapshotsIntoStoreMap(state.byUserId, snapshots, {
          observedAtIso,
          fillOnly: initial,
        }),
      }));
      messengerMonitorRecord({
        category: "realtime.subscription",
        metric: "presence_snapshot_fallback",
        value: Math.round(elapsedMs),
        unit: "ms",
        labels: { scope: PRESENCE_SNAPSHOT_MONITOR_SCOPE, batchSize: String(snapshots.size) },
      });
    },
    /** 전역 presence 채널 없음 — 첫 값은 서버 스냅샷, 이후는 shouldRepoll 규칙만 */
    isRealtimeHealthy: () => false,
    shouldRepoll: (userId) => useMessengerPresenceStore.getState().byUserId[userId]?.state === "online",
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
  fallback?: CommunityMessengerPeerPresenceSnapshot | null,
  options?: {
    /**
     * D1 2단계 — 상대의 접속 전환(앞화면 진입·백그라운드·종료)을 사용자별 비공개 토픽으로 실시간 수신.
     * 1:1 방 머리글처럼 「지금 보고 있는 한 사람」에게만 켠다(목록 행에는 켜지 않는다 — 구독 수 = 화면 상대 수가 되므로).
     */
    live?: boolean;
  }
): CommunityMessengerPeerPresenceSnapshot | null {
  const id = typeof userId === "string" ? userId.trim() : "";
  /** 전체 `byUserId` 엔트리가 아닌 표시용 primitive 만 구독 — `replacePresenceMap` 시 무관 행 리렌더 방지 */
  /** P3: 서버 첫 값·구 클라이언트의 `away` 도 오프라인으로 (「자리 비움」 없음) */
  const liveState = useMessengerPresenceStore((state) =>
    id ? normalizeLegacyPresenceState(state.byUserId[id]?.state) : null
  );
  const liveUpdatedAt = useMessengerPresenceStore((state) => (id ? state.byUserId[id]?.updatedAt ?? null : null));
  /** 서버 조회·실시간 퇴장으로 들어온 마지막 접속 시각 — 머리글·점 3개 메뉴 「마지막 접속 …」 (2026-11-16 감사 F2) */
  const liveLastSeenAt = useMessengerPresenceStore((state) => (id ? state.byUserId[id]?.lastSeenAt ?? null : null));
  useEffect(() => {
    if (!id) return;
    return getPresenceSnapshotPollScheduler().subscribe(id);
  }, [id]);
  const live = options?.live === true;
  useEffect(() => {
    if (!id || !live) return;
    return acquireCommunityMessengerPresenceUserBroadcast(id);
  }, [id, live]);
  /** 실시간 전환·스냅샷으로 온라인이 되면 만료 전 재확인을 다시 예약한다 */
  useEffect(() => {
    if (!id || liveState !== "online") return;
    getPresenceSnapshotPollScheduler().notifyVisible();
  }, [id, liveState, liveUpdatedAt]);
  /** online 관측이 policy 창을 넘기는 시점에 재평가하기 위한 tick */
  const [stalenessTick, setStalenessTick] = useState(0);
  const resolved = useMemo(() => {
    if (!liveState) return null;
    /** 관측 시각(수신 시각) 기준 — 판정 창(150s)을 넘긴 온라인 관측은 마지막 접속으로 */
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
      const lastSeenAt = liveLastSeenAt ?? fallback?.lastSeenAt ?? null;
      const prev = snapshotStableRef.current;
      if (prev && prev.userId === id && prev.state === displayState && prev.lastSeenAt === lastSeenAt) return prev;
      const next: CommunityMessengerPeerPresenceSnapshot = {
        userId: id,
        state: displayState,
        lastSeenAt: liveLastSeenAt ?? fallback?.lastSeenAt ?? null,
      };
      snapshotStableRef.current = next;
      return next;
    }
    if (!fallback) return null;
    return fallback;
  }, [fallback, id, displayState, liveLastSeenAt]);
}
