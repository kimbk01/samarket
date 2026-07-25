"use client";

import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { resolveMessengerHomeBootstrapSetData } from "@/lib/community-messenger/dev/cm-event-loop-dev";
import { createCmHomeListRafPatchScheduler } from "@/lib/community-messenger/dev/cm-raf-home-list-patch";
import { createCmParticipantUnreadRafBatcher } from "@/lib/community-messenger/dev/cm-raf-participant-unread-batch";
import { useCmDevRenderTrace, useCmStrictModeEffectProbe } from "@/lib/community-messenger/dev/cm-event-loop-dev";
import { scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";
import { peekBootstrapCache, primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { applyHomeListPatch, findHomeListRoomRow } from "@/lib/community-messenger/home-list-patch";
import { cmRtReadSyncLog } from "@/lib/community-messenger/read/cm-rt-read-sync-log";
import { HOME_MISSING_ROOM_SUMMARY_DEBOUNCE_MS } from "@/lib/community-messenger/home/community-messenger-home-constants";
import { communityMessengerRoomIsTrade } from "@/lib/community-messenger/messenger-room-domain";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import { markNotificationBadgePollDirty } from "@/lib/notifications/notification-badge-count-store";
import { logCmSurfaceSync } from "@/lib/community-messenger/notifications/cm-participant-surface-sync";
import { applyMessengerRoomUnreadFactAndSyncBottom } from "@/lib/community-messenger/unread/messenger-room-unread-authority";
import { onCommunityMessengerBusEvent, type MessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { requestMessengerHomeListMergeFromHomeSummary } from "@/lib/community-messenger/request-messenger-home-list-merge-from-summary";
import { resolveMessengerUnreadMerge } from "@/lib/community-messenger/consistency/messenger-consistency-merge";
import {
  cmReadBadgeLog,
  resolveUnreadWithLocalReadGuard,
  setLocalReadGuard,
} from "@/lib/community-messenger/read/local-read-guard";
import {
  broadcastMessengerReconnectPreserveCrossTab,
  wireMessengerConsistencyCrossTabHandlers,
} from "@/lib/community-messenger/consistency/messenger-consistency-cross-tab";
import { recordReconnectStressEvent } from "@/lib/ops/reconnect-stress-analysis";
import { patchMessengerRoomReadSnapshotRuntime } from "@/lib/community-messenger/realtime/messenger-realtime-snapshot-runtime";
import {
  applyIncomingMessageEvent,
  normalizeMessengerRealtimeRoomId,
} from "@/lib/community-messenger/stores/messenger-realtime-store";
import {
  type CommunityMessengerHomeRealtimeMessageInsertHint,
  type CommunityMessengerHomeRealtimeParticipantUnreadHint,
  useCommunityMessengerHomeRealtime,
} from "@/lib/community-messenger/use-community-messenger-realtime";
import { cmRtStableSubLog } from "@/lib/community-messenger/realtime/cm-rt-stable-sub-log";
import { messengerIncomingMessageAlreadyTracked } from "@/lib/community-messenger/stores/messenger-realtime-store";
import {
  noteHomeListServerUnreadIncrease,
  peekRecentHomeListServerUnreadIncrease,
  clearHomeListServerUnreadIncrease,
  clearHomeListServerUnreadIncreaseForTests,
} from "@/lib/community-messenger/merge-critical-home-sync-room-summary";
import {
  noteHomeVisibilityHidden,
  noteHomeVisibilityRestored,
  shouldBlockSilentHomeSyncForVisibilityRestore,
} from "@/lib/community-messenger/home/lite-merge-gate";
import { invalidateCommunityMessengerHomeSilentListsReplay } from "@/lib/community-messenger/cm-home-silent-lists-fetch";
import type { MessengerHomeShadowDispatch } from "@/lib/community-messenger/home/inbox-pipeline/shadow";
import type { CanonicalMessengerHomeRoomPatch } from "@/lib/community-messenger/home/inbox-pipeline/types";

const HOME_SUMMARY_MIN_FETCH_GAP_MS = 1_500;
/** Realtime meta → home-sync silent refresh 최소 간격(부트스트랩 debounce 와 정렬) */
const HOME_REALTIME_SILENT_REFRESH_MIN_GAP_MS = 2_400;
let cmHomeRealtimeRefreshScheduleOrdinal = 0;

export { clearHomeListServerUnreadIncreaseForTests };

export type HomeListUnreadZeroBusContext = {
  busType: "cm.room.read" | "cm.room.local_unread";
  roomId: string;
  incomingUnread: number;
  existingUnread: number;
  lastReadMessageId?: string | null;
};

/**
 * stale optimistic `local_unread(0)` / read bus 가 서버에서 확인된 positive unread 를 덮지 못하게 한다.
 * 실제 mark_read(`lastReadMessageId` 존재) 는 0 허용.
 */
export function shouldBlockStaleHomeListUnreadZero(ctx: HomeListUnreadZeroBusContext): boolean {
  if (ctx.incomingUnread !== 0) return false;
  const existingUnread = Math.max(0, Math.floor(Number(ctx.existingUnread) || 0));
  if (existingUnread <= 0) return false;

  if (ctx.busType === "cm.room.read") {
    const lastReadMessageId = String(ctx.lastReadMessageId ?? "").trim();
    if (lastReadMessageId) return false;
  }

  const recentServerUnread = peekRecentHomeListServerUnreadIncrease(ctx.roomId);
  return recentServerUnread != null && recentServerUnread > 0;
}

/**
 * Phase1 가 연속으로 `cm.room.read` → `cm.room.local_unread`(0) 를 보낼 때
 * 동일 스택에서 중복으로 홈 list patch·`setData` 가 도는 것을 막는다.
 */
let busUnreadZeroHandledAfterReadRoomId: string | null = null;

function registerBusRoomReadUnreadZeroForDedupe(roomId: string): void {
  busUnreadZeroHandledAfterReadRoomId = roomId;
  queueMicrotask(() => {
    if (busUnreadZeroHandledAfterReadRoomId === roomId) {
      busUnreadZeroHandledAfterReadRoomId = null;
    }
  });
}

function tryConsumeBusLocalUnreadDuplicateAfterRead(roomId: string, unreadCount: number): boolean {
  if (unreadCount !== 0) return false;
  if (busUnreadZeroHandledAfterReadRoomId !== roomId) return false;
  busUnreadZeroHandledAfterReadRoomId = null;
  return true;
}

/** `cm.room.summary_patch` — local-read-guard 통과 후 unread 반영 (읽음 후 stale 재등장 차단). */
export function applyHomeListSummaryPatchUnread(
  room: CommunityMessengerRoomSummary,
  nextUnread: number | null
): CommunityMessengerRoomSummary {
  if (nextUnread == null) return room;
  const prevUnread = Math.max(0, Math.floor(Number(room.unreadCount) || 0));
  const guarded = resolveUnreadWithLocalReadGuard({
    roomId: room.id,
    incomingUnread: nextUnread,
    incomingLastMessageAt: String(room.lastMessageAt ?? ""),
  });
  const unreadCount = guarded.unreadCount;
  if (unreadCount === room.unreadCount) return room;
  if (unreadCount > prevUnread) {
    noteHomeListServerUnreadIncrease(room.id, unreadCount);
  }
  return { ...room, unreadCount };
}

/**
 * participant_unread_delta — 서버 unread 증가는 local-read-guard 동일 timestamp suppress 예외.
 * critical_patch narrow exception 과 동일 철학; stale_version_discard 는 유지.
 */
export function mergeParticipantUnreadDeltaIntoHomeListRoom(
  room: CommunityMessengerRoomSummary,
  hint: CommunityMessengerHomeRealtimeParticipantUnreadHint
): CommunityMessengerRoomSummary {
  const rid = String(hint.roomId ?? room.id ?? "").trim();
  const hintUnread = Math.max(0, Math.floor(Number(hint.unreadCount) || 0));
  const prevUnread = Math.max(0, Math.floor(Number(room.unreadCount) || 0));
  const merged = resolveMessengerUnreadMerge({
    surface: "realtime",
    roomId: rid,
    incomingUnread: hintUnread,
    incomingLastMessageAt: String(room.lastMessageAt ?? ""),
    source: "participant_unread_delta",
    eventType: "participant_unread_delta",
    prevUnread,
    duplicateEventKey: `${rid}:${hintUnread}:${hint.lastReadMessageId ?? ""}:${hint.lastReadAt ?? ""}`,
    reconnectState: "realtime",
  });
  let unreadCount = merged.unreadCount;
  const serverUnreadIncreased = hintUnread > prevUnread;
  if (
    serverUnreadIncreased &&
    merged.resolution_path !== "stale_version_discard" &&
    unreadCount < hintUnread
  ) {
    unreadCount = hintUnread;
  }
  if (unreadCount === room.unreadCount) return room;
  if (unreadCount > prevUnread) {
    noteHomeListServerUnreadIncrease(rid, unreadCount);
  }
  return { ...room, unreadCount };
}

function bootstrapHasRoomRow(root: CommunityMessengerBootstrap, roomId: string): boolean {
  const rid = String(roomId ?? "").trim();
  if (!rid) return false;
  const match = (r: CommunityMessengerRoomSummary) => String(r.id) === rid;
  return (root.chats ?? []).some(match) || (root.groups ?? []).some(match);
}

export type UseCommunityMessengerHomeRealtimeBootstrapListArgs = {
  userId: string | null | undefined;
  /** 부트스트랩 홈 방 id + 라우트 오픈 방 — fingerprint 안정 분리 */
  roomIds: string[];
  /** 거래·배달 채팅 리스트 visible 행 방 id 만 (`roomIds` 와 합쳐 INSERT 필터) */
  extraRoomIds?: string[];
  /** 홈 부트스트랩 로딩 — 빈 room 목록일 때 rooms-in 지연 판정 */
  bootstrapListLoading: boolean;
  homeRealtimeGateOpen: boolean;
  refresh: (silent?: boolean) => Promise<void>;
  setData: Dispatch<SetStateAction<CommunityMessengerBootstrap | null>>;
  shadowDispatch?: MessengerHomeShadowDispatch;
};

function patchFromRealtimeMessageRow(roomId: string, row: Record<string, unknown>): CanonicalMessengerHomeRoomPatch {
  const createdAt = typeof row.created_at === "string" ? row.created_at : undefined;
  const messageType = typeof row.message_type === "string" ? row.message_type : undefined;
  const content = typeof row.content === "string" ? row.content : "";
  return {
    roomId,
    ...(createdAt ? { lastMessageAt: createdAt } : {}),
    latestMessage: content,
    ...(messageType ? { latestMessageType: messageType as CanonicalMessengerHomeRoomPatch["latestMessageType"] } : {}),
  };
}

/**
 * 홈 방 목록 부트스트랩에 대한 Realtime 메시지/참가자 unread 패치 및 누락 방 home-summary 병합.
 * `CommunityMessengerHome` 본문에서 네트워크·캐시 갱신 경계만 분리한다.
 */
export function useCommunityMessengerHomeRealtimeBootstrapList({
  userId,
  roomIds,
  extraRoomIds,
  bootstrapListLoading,
  homeRealtimeGateOpen,
  refresh,
  setData,
  shadowDispatch,
}: UseCommunityMessengerHomeRealtimeBootstrapListArgs): void {
  useCmDevRenderTrace("useCommunityMessengerHomeRealtimeBootstrapList");
  useCmStrictModeEffectProbe("useCommunityMessengerHomeRealtimeBootstrapList");
  const scheduleListPatch = useMemo(() => createCmHomeListRafPatchScheduler(setData), [setData]);
  const homeMissingRoomSummaryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const homeSummaryLastFetchAtRef = useRef<Map<string, number>>(new Map());
  const homeRealtimeRefreshLastAtRef = useRef(0);
  const homeRealtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const homeRealtimeSilentRefreshInFlightRef = useRef(false);
  const shadowGenerationRef = useRef(0);
  const nextShadowGeneration = useCallback(() => {
    shadowGenerationRef.current += 1;
    return shadowGenerationRef.current;
  }, []);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const silentRefreshRef = useRef((silent?: boolean) => {
    if (silent && shouldBlockSilentHomeSyncForVisibilityRestore()) {
      return Promise.resolve();
    }
    return refreshRef.current(silent);
  });
  silentRefreshRef.current = (silent?: boolean) => {
    if (silent && shouldBlockSilentHomeSyncForVisibilityRestore()) {
      return Promise.resolve();
    }
    return refreshRef.current(silent);
  };

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        noteHomeVisibilityHidden();
        return;
      }
      noteHomeVisibilityRestored();
    };
    const onPageShow = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        noteHomeVisibilityRestored();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", onPageShow);
      for (const t of homeMissingRoomSummaryTimersRef.current.values()) {
        clearTimeout(t);
      }
      homeMissingRoomSummaryTimersRef.current.clear();
      if (homeRealtimeRefreshTimerRef.current != null) {
        clearTimeout(homeRealtimeRefreshTimerRef.current);
        homeRealtimeRefreshTimerRef.current = null;
      }
    };
  }, []);

  const scheduleHomeRealtimeRefresh = useCallback(() => {
    /**
     * P4-a intent — Background dirty signal (conditional, not every resume).
     * This callback fires only when the existing code already decided a catch-up is
     * needed: an RT resubscribe (2nd SUBSCRIBED after a drop) or a real RT change event
     * that did not resolve to a participant delta. In those cases the app may have missed
     * an unread fact while backgrounded, so wake the P3-c2 dirty poll fallback once.
     * The next poll tick runs a single non-fresh fetch; success clears dirty.
     *
     * DO NOT set dirty on plain visibility resume (clean resume stays HTTP 0) — that path
     * does not call this callback. DO NOT add a new RT health coordinator / poll policy;
     * this only reuses the existing markNotificationBadgePollDirty entry point (P0~P3-c3 LOCK).
     */
    markNotificationBadgePollDirty("home_realtime_reconnect_catchup");
    if (shouldBlockSilentHomeSyncForVisibilityRestore()) {
      return;
    }
    const now = Date.now();
    cmHomeRealtimeRefreshScheduleOrdinal += 1;
    broadcastMessengerReconnectPreserveCrossTab(String(userId ?? "").trim());
    cmRtStableSubLog("home_realtime_refresh_schedule", {
      scheduleOrdinal: cmHomeRealtimeRefreshScheduleOrdinal,
      atMs: Date.now(),
    });
    const elapsed = now - homeRealtimeRefreshLastAtRef.current;
    const minGapMs = HOME_REALTIME_SILENT_REFRESH_MIN_GAP_MS;
    const runSilentHomeSync = () => {
      if (shouldBlockSilentHomeSyncForVisibilityRestore()) {
        return;
      }
      if (homeRealtimeSilentRefreshInFlightRef.current) {
        return;
      }
      homeRealtimeRefreshLastAtRef.current = Date.now();
      recordReconnectStressEvent("home", "silent_refresh");
      homeRealtimeSilentRefreshInFlightRef.current = true;
      void silentRefreshRef.current(true).finally(() => {
        homeRealtimeSilentRefreshInFlightRef.current = false;
      });
    };
    if (elapsed >= minGapMs) {
      scheduleWhenBrowserIdle(runSilentHomeSync, 520);
      return;
    }
    if (homeRealtimeRefreshTimerRef.current != null) return;
    homeRealtimeRefreshTimerRef.current = setTimeout(() => {
      homeRealtimeRefreshTimerRef.current = null;
      scheduleWhenBrowserIdle(runSilentHomeSync, 520);
    }, minGapMs - elapsed);
  }, [userId]);

  const scheduleHomeMissingRoomSummaryMerge = useCallback(
    (roomId: string) => {
      const id = String(roomId ?? "").trim();
      if (!id) return;
      const timers = homeMissingRoomSummaryTimersRef.current;
      const existing = timers.get(id);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        timers.delete(id);
        void (async () => {
          try {
            const now = Date.now();
            const lastFetchAt = homeSummaryLastFetchAtRef.current.get(id) ?? 0;
            if (now - lastFetchAt < HOME_SUMMARY_MIN_FETCH_GAP_MS) return;
            homeSummaryLastFetchAtRef.current.set(id, now);
            const res = await runSingleFlight(
              `community-messenger:home:missing-room-summary:${id}`,
              () =>
                fetch(`/api/community-messenger/rooms/${encodeURIComponent(id)}/home-summary`, {
                  credentials: "include",
                })
            );
            const json = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              room?: CommunityMessengerRoomSummary;
            };
            if (!res.ok || !json.ok || !json.room) return;
            shadowDispatch?.dispatchRoomSummary("realtime", nextShadowGeneration(), json.room);
            setData((prev) => {
              const merged = applyHomeListPatch(
                prev,
                { kind: "merge_room_summary", summary: json.room! },
                "realtime"
              );
              const resolved = resolveMessengerHomeBootstrapSetData(
                "realtime-message",
                prev,
                !merged || merged === prev ? prev : merged,
                { reason: "missing_room_summary_merge", roomId: id }
              );
              if (resolved && resolved !== prev) primeBootstrapCache(resolved);
              return resolved;
            });
          } catch {
            /* ignore */
          }
        })();
      }, HOME_MISSING_ROOM_SUMMARY_DEBOUNCE_MS);
      timers.set(id, t);
    },
    [nextShadowGeneration, setData, shadowDispatch]
  );

  const applyRealtimeMessageListBatch = useCallback(
    (batch: CommunityMessengerHomeRealtimeMessageInsertHint[]) => {
      if (batch.length === 0) return;
      const missedRooms = new Set<string>();
      const me = String(userId ?? "").trim();
      for (const hint of batch) {
        const rid = String(hint.roomId ?? "").trim();
        if (!rid) continue;
        shadowDispatch?.dispatchPatch("realtime", nextShadowGeneration(), patchFromRealtimeMessageRow(rid, hint.newRecord));
        applyIncomingMessageEvent({
          viewerUserId: me || null,
          roomId: rid,
          messageRow: hint.newRecord,
        });
      }
      setData((prev) => {
        if (!prev) return prev;
        let cur = prev;
        for (const hint of batch) {
          const rid = String(hint.roomId ?? "").trim();
          const senderRaw =
            hint.newRecord && typeof hint.newRecord.sender_id === "string"
              ? hint.newRecord.sender_id.trim()
              : "";
          const isMine = Boolean(me && senderRaw && messengerUserIdsEqual(senderRaw, me));
          const next = applyHomeListPatch(
            cur,
            {
              kind: "realtime_message_insert",
              roomId: hint.roomId,
              messageRow: hint.newRecord,
              boostUnreadCount: !isMine,
            },
            "realtime"
          );
          if (!next || next === cur) {
            if (rid && !bootstrapHasRoomRow(cur, rid)) missedRooms.add(rid);
          } else {
            cur = next;
          }
        }
        const resolved = resolveMessengerHomeBootstrapSetData(
          "realtime-message",
          prev,
          cur === prev ? prev : cur,
          { reason: "realtime_message_batch", roomId: batch[0]?.roomId }
        );
        if (resolved && resolved !== prev) primeBootstrapCache(resolved);
        return resolved;
      });
      for (const rid of missedRooms) {
        if (rid) scheduleHomeMissingRoomSummaryMerge(rid);
      }
    },
    [nextShadowGeneration, setData, shadowDispatch, scheduleHomeMissingRoomSummaryMerge, userId]
  );

  const flushParticipantUnreadBatch = useCallback(
    (batch: CommunityMessengerHomeRealtimeParticipantUnreadHint[]) => {
      if (batch.length === 0) return;
      const me = String(userId ?? "").trim();
      for (const hint of batch) {
        const rid = String(hint.roomId ?? "").trim();
        if (rid) {
          shadowDispatch?.dispatchPatch("participant", nextShadowGeneration(), {
            roomId: rid,
            unreadCount: hint.unreadCount,
          });
        }
        cmRtReadSyncLog("list_unread_increment_apply", {
          roomId: rid,
          viewerUserId: me || null,
          unreadCount: hint.unreadCount,
          lastReadMessageId: hint.lastReadMessageId ?? null,
          lastReadAt: hint.lastReadAt ?? null,
          channelScope: "home_meta_self_delta",
        });
      }
      scheduleListPatch((prev) => {
        let cur = prev;
        let changed = false;
        for (const hint of batch) {
          const rid = String(hint.roomId ?? "").trim();
          const hintNorm = normalizeMessengerRealtimeRoomId(hint.roomId);
          const existing = findHomeListRoomRow(cur, rid);
          if (!existing) {
            queueMicrotask(() => {
              if (rid) scheduleHomeMissingRoomSummaryMerge(rid);
              requestMessengerHubBadgeResync("participant_unread_changed", {
                roomId: rid,
                participantUnreadDirection: "increase",
              });
            });
            continue;
          }
          const next = applyHomeListPatch(
            cur,
            {
              kind: "room_update",
              roomId: rid,
              updater: (room) => mergeParticipantUnreadDeltaIntoHomeListRoom(room, hint),
            },
            "realtime"
          );
          if (next && next !== cur) {
            cur = next;
            changed = true;
          }
          const prevUnread = Math.max(0, Math.floor(Number(existing?.unreadCount) || 0));
          const nextUnread = Math.max(0, Math.floor(Number(hint.unreadCount) || 0));
          queueMicrotask(() => {
            if (existing && communityMessengerRoomIsTrade(existing)) {
              scheduleHomeMissingRoomSummaryMerge(existing.id);
            }
            /**
             * P3-c3 LOCK intent — home list participant catch-up aligns with P3-c1 hub-sync:
             * decrease/same-facts + room fact Authority commit → Domain fresh 0.
             * increase keeps unconditional fresh. baseline/domain/apply fail → fallback 1.
             * DO NOT change merge_summary / silent home-sync / resubscribe list catch-up itself.
             */
            if (nextUnread > prevUnread) {
              requestMessengerHubBadgeResync("participant_unread_changed", {
                roomId: rid,
                participantUnreadDirection: "increase",
              });
              return;
            }
            const eventVersion = Date.now();
            const applied = applyMessengerRoomUnreadFactAndSyncBottom({
              roomId: rid,
              viewerUserId: me,
              unreadCount: nextUnread,
              prevUnreadHint: prevUnread,
              lastMessageAt: existing?.lastMessageAt ?? null,
              versionMs: eventVersion,
              source: "participant_rt",
              authoritySource: "participant_realtime",
              eventIdentity: `participant_home_list:${rid}:${prevUnread}->${nextUnread}:${eventVersion}`,
            });
            const decreaseFallback = !applied.authorityApplied;
            logCmSurfaceSync({
              phase: "participant_decrease",
              roomId: rid,
              t0: eventVersion,
              bottom_ms: null,
              list_cache_ms: null,
              sound_schedule_ms: null,
              banner_ms: null,
              unread: applied.unreadCount,
              prevUnread,
              authorityApplied: applied.authorityApplied,
              freshResync: decreaseFallback ? 1 : 0,
            });
            if (decreaseFallback) {
              requestMessengerHubBadgeResync("participant_unread_changed", {
                roomId: rid,
                participantUnreadDirection: "decrease",
              });
            }
          });
        }
        if (!changed) return prev;
        primeBootstrapCache(cur);
        return cur;
      }, "unread-delta");
    },
    [nextShadowGeneration, scheduleHomeMissingRoomSummaryMerge, shadowDispatch, userId]
  );

  const enqueueParticipantUnread = useMemo(
    () => createCmParticipantUnreadRafBatcher(flushParticipantUnreadBatch),
    [flushParticipantUnreadBatch]
  );

  const applyParticipantUnreadDelta = useCallback(
    (hint: CommunityMessengerHomeRealtimeParticipantUnreadHint) => {
      enqueueParticipantUnread(hint);
    },
    [enqueueParticipantUnread]
  );

  useEffect(() => {
    const me = userId?.trim();
    if (!me || !homeRealtimeGateOpen) return;
    return onCommunityMessengerBusEvent((ev: MessengerBusEvent) => {
      if (ev.type === "cm.room.bump") return;

      if (ev.type === "cm.home.merge_room_summary") {
        if (String(ev.viewerUserId) !== me) return;
        shadowDispatch?.dispatchRoomSummary("multi_tab", nextShadowGeneration(), ev.summary);
        scheduleListPatch(
          (prev) => {
            const next = applyHomeListPatch(prev, { kind: "merge_room_summary", summary: ev.summary }, "multi-tab");
            if (!next || next === prev) return prev;
            return next;
          },
          "bus",
          { bypassRenderPause: true }
        );
        queueMicrotask(() => {
          requestMessengerHubBadgeResync("home_list_merge_summary");
        });
        return;
      }

      if (ev.type === "cm.room.local_unread") {
        if (String(ev.viewerUserId) !== me) return;
        if (tryConsumeBusLocalUnreadDuplicateAfterRead(ev.roomId, ev.unreadCount)) {
          return;
        }
        const evRoomNormEarly = normalizeMessengerRealtimeRoomId(ev.roomId);
        const existingEarly = findHomeListRoomRow(peekBootstrapCache(), ev.roomId);
        if (
          existingEarly &&
          evRoomNormEarly &&
          existingEarly.unreadCount === ev.unreadCount
        ) {
          return;
        }
        if (
          shouldBlockStaleHomeListUnreadZero({
            busType: "cm.room.local_unread",
            roomId: ev.roomId,
            incomingUnread: ev.unreadCount,
            existingUnread: existingEarly?.unreadCount ?? 0,
          })
        ) {
          cmReadBadgeLog("home_list_stale_unread_zero_blocked", {
            roomId: ev.roomId,
            busType: "cm.room.local_unread",
            existingUnread: existingEarly?.unreadCount ?? 0,
          });
          return;
        }
        shadowDispatch?.dispatchPatch("participant", nextShadowGeneration(), {
          roomId: ev.roomId,
          unreadCount: ev.unreadCount,
        });
        let tradeRoomForLegacyUnreadResync: string | null = null;
        let missedList = false;
        scheduleListPatch((prev) => {
          const evRoomNorm = normalizeMessengerRealtimeRoomId(ev.roomId);
          const existing = [...prev.chats, ...prev.groups].find(
            (room) => normalizeMessengerRealtimeRoomId(room.id) === evRoomNorm
          );
          if (existing && communityMessengerRoomIsTrade(existing)) {
            tradeRoomForLegacyUnreadResync = existing.id;
          }
          const next = applyHomeListPatch(
            prev,
            { kind: "local_unread", roomId: ev.roomId, unreadCount: ev.unreadCount },
            "optimistic-read"
          );
          if (!next || next === prev) {
            missedList = true;
            return prev;
          }
          primeBootstrapCache(next);
          return next;
        }, "bus", { bypassRenderPause: true });
        if (missedList) scheduleHomeMissingRoomSummaryMerge(ev.roomId);
        else if (tradeRoomForLegacyUnreadResync) {
          scheduleHomeMissingRoomSummaryMerge(tradeRoomForLegacyUnreadResync);
        }
        return;
      }

      if (ev.type === "cm.room.incoming_message") {
        if (String(ev.viewerUserId) !== me) return;
        const busMessageId =
          typeof ev.messageRow?.id === "string" ? ev.messageRow.id.trim() : "";
        if (busMessageId && messengerIncomingMessageAlreadyTracked(ev.roomId, busMessageId)) {
          return;
        }
        applyIncomingMessageEvent({
          viewerUserId: me,
          roomId: ev.roomId,
          messageRow: ev.messageRow,
        });
        shadowDispatch?.dispatchPatch("realtime", nextShadowGeneration(), patchFromRealtimeMessageRow(ev.roomId, ev.messageRow));
        let missedIncoming = false;
        scheduleListPatch((prev) => {
          const next = applyHomeListPatch(
            prev,
            {
              kind: "realtime_message_insert",
              roomId: ev.roomId,
              messageRow: ev.messageRow,
              boostUnreadCount: true,
            },
            "realtime"
          );
          if (!next || next === prev) {
            missedIncoming = true;
            return prev;
          }
          primeBootstrapCache(next);
          return next;
        }, "bus");
        if (missedIncoming) scheduleHomeMissingRoomSummaryMerge(ev.roomId);
        return;
      }

      if (ev.type === "cm.room.summary_patch") {
        if (String(ev.viewerUserId) !== me) return;
        const summaryExisting = findHomeListRoomRow(peekBootstrapCache(), ev.roomId);
        const nextUnread =
          typeof ev.unreadCount === "number" && Number.isFinite(ev.unreadCount)
            ? Math.max(0, Math.floor(ev.unreadCount))
            : null;
        if (summaryExisting && nextUnread != null && summaryExisting.unreadCount === nextUnread) {
          return;
        }
        if (nextUnread != null) {
          shadowDispatch?.dispatchPatch("participant", nextShadowGeneration(), {
            roomId: ev.roomId,
            unreadCount: nextUnread,
          });
        }
        let missedSummary = false;
        scheduleListPatch((prev) => {
          const existing = findHomeListRoomRow(prev, ev.roomId);
          if (!existing) {
            missedSummary = true;
            return prev;
          }
          const next = applyHomeListPatch(
            prev,
            {
              kind: "room_update",
              roomId: ev.roomId,
              updater: (room) => applyHomeListSummaryPatchUnread(room, nextUnread),
            },
            "mark-read"
          );
          if (!next || next === prev) {
            missedSummary = true;
            return prev;
          }
          primeBootstrapCache(next);
          return next;
        }, "bus", { bypassRenderPause: true });
        if (missedSummary) scheduleHomeMissingRoomSummaryMerge(ev.roomId);
        return;
      }

      if (ev.type === "cm.room.call_stub_preview") {
        if (String(ev.viewerUserId) !== me) return;
        shadowDispatch?.dispatchPatch("multi_tab", nextShadowGeneration(), {
          roomId: ev.roomId,
          latestMessage: ev.preview.lastMessage,
          latestMessageType: ev.preview.lastMessageType,
          lastMessageAt: ev.preview.lastMessageAt,
        });
        let missedPreview = false;
        scheduleListPatch(
          (prev) => {
            const next = applyHomeListPatch(
              prev,
              { kind: "call_stub_preview", roomId: ev.roomId, preview: ev.preview },
              "multi-tab"
            );
            if (!next || next === prev) {
              missedPreview = true;
              return prev;
            }
            return next;
          },
          "bus",
          { bypassRenderPause: true }
        );
        if (missedPreview) scheduleHomeMissingRoomSummaryMerge(ev.roomId);
        return;
      }

      if (ev.type === "cm.room.read") {
        if (String(ev.viewerUserId) !== me) return;
        const readRow = findHomeListRoomRow(peekBootstrapCache(), ev.roomId);
        if (readRow && (readRow.unreadCount ?? 0) === 0) {
          invalidateCommunityMessengerHomeSilentListsReplay({ tier: "full" });
          registerBusRoomReadUnreadZeroForDedupe(ev.roomId);
          return;
        }
        if (
          shouldBlockStaleHomeListUnreadZero({
            busType: "cm.room.read",
            roomId: ev.roomId,
            incomingUnread: 0,
            existingUnread: readRow?.unreadCount ?? 0,
            lastReadMessageId: ev.lastReadMessageId,
          })
        ) {
          cmReadBadgeLog("home_list_stale_unread_zero_blocked", {
            roomId: ev.roomId,
            busType: "cm.room.read",
            existingUnread: readRow?.unreadCount ?? 0,
            lastReadMessageId: ev.lastReadMessageId ?? null,
          });
          return;
        }
        setLocalReadGuard({
          roomId: ev.roomId,
          referenceLastMessageAt: String(readRow?.lastMessageAt ?? ""),
          source: "bus_sync",
        });
        cmReadBadgeLog("read_bus_receive", { roomId: ev.roomId });
        patchMessengerRoomReadSnapshotRuntime({
          viewerUserId: me,
          roomId: ev.roomId,
        });
        clearHomeListServerUnreadIncrease(ev.roomId);
        invalidateCommunityMessengerHomeSilentListsReplay({ tier: "full" });
        shadowDispatch?.dispatchPatch("participant", nextShadowGeneration(), {
          roomId: ev.roomId,
          unreadCount: 0,
        });
        let missedRead = false;
        scheduleListPatch((prev) => {
          const next = applyHomeListPatch(
            prev,
            { kind: "local_unread", roomId: ev.roomId, unreadCount: 0 },
            "mark-read"
          );
          if (!next || next === prev) {
            missedRead = true;
            return prev;
          }
          primeBootstrapCache(next);
          return next;
        }, "bus", { bypassRenderPause: true });
        if (missedRead) scheduleHomeMissingRoomSummaryMerge(ev.roomId);
        registerBusRoomReadUnreadZeroForDedupe(ev.roomId);
        return;
      }

      if (ev.type === "cm.room.message_sent") {
        if (!ev.senderUserId || String(ev.senderUserId) !== me) return;
        patchMessengerRoomReadSnapshotRuntime({ viewerUserId: me, roomId: ev.roomId });
        if (ev.listPreview) {
          shadowDispatch?.dispatchPatch("multi_tab", nextShadowGeneration(), {
            roomId: ev.roomId,
            latestMessage: ev.listPreview.lastMessage,
            latestMessageType: ev.listPreview.lastMessageType,
            lastMessageAt: ev.listPreview.lastMessageAt,
          });
        }
        let missedEcho = false;
        scheduleListPatch(
          (prev) => {
            const next = applyHomeListPatch(
              prev,
              { kind: "sender_local_echo", roomId: ev.roomId, preview: ev.listPreview ?? null },
              "optimistic-read"
            );
            if (!next || next === prev) {
              missedEcho = true;
              return prev;
            }
            return next;
          },
          "bus",
          { bypassRenderPause: true }
        );
        if (missedEcho) {
          void requestMessengerHomeListMergeFromHomeSummary(ev.roomId, "sender_echo_room_missing");
        }
      }
    });
  }, [
    homeRealtimeGateOpen,
    nextShadowGeneration,
    scheduleHomeMissingRoomSummaryMerge,
    scheduleListPatch,
    shadowDispatch,
    userId,
  ]);

  useEffect(() => {
    const me = userId?.trim();
    if (!me || !homeRealtimeGateOpen) return;
    return wireMessengerConsistencyCrossTabHandlers({
      viewerUserId: me,
      onMarkAllRead: () => {
        scheduleListPatch((prev) => {
          const zeroAll = (rooms: CommunityMessengerRoomSummary[]) =>
            rooms.map((room) => (room.unreadCount === 0 ? room : { ...room, unreadCount: 0 }));
          const prevChats = prev.chats ?? [];
          const prevGroups = prev.groups ?? [];
          const nextChats = zeroAll(prevChats);
          const nextGroups = zeroAll(prevGroups);
          const chatsStable =
            nextChats.length === prevChats.length && nextChats.every((row, i) => row === prevChats[i]);
          const groupsStable =
            nextGroups.length === prevGroups.length && nextGroups.every((row, i) => row === prevGroups[i]);
          if (chatsStable && groupsStable) return prev;
          const next = {
            ...prev,
            chats: nextChats,
            groups: nextGroups,
          };
          primeBootstrapCache(next);
          return next;
        }, "bus");
        requestMessengerHubBadgeResync("mark_all_read_cross_tab");
      },
    });
  }, [homeRealtimeGateOpen, scheduleListPatch, userId]);

  useCommunityMessengerHomeRealtime({
    userId: userId ?? null,
    roomIds,
    extraRoomIds,
    deferEmptyRoomsWhileBootstrapLoading: true,
    bootstrapListLoading,
    enabled: Boolean(userId) && homeRealtimeGateOpen,
    onRefresh: scheduleHomeRealtimeRefresh,
    onRealtimeMessageInsertBatch: applyRealtimeMessageListBatch,
    onParticipantUnreadDelta: applyParticipantUnreadDelta,
  });
}
