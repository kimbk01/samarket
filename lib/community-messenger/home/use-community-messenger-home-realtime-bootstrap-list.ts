"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { mergeBootstrapRoomSummaryIntoLists } from "@/lib/community-messenger/home/merge-bootstrap-room-summary-into-lists";
import { cmRtReadSyncLog } from "@/lib/community-messenger/read/cm-rt-read-sync-log";
import {
  patchBootstrapRoomListForRealtimeMessageInsert,
  patchBootstrapRoomListForSenderLocalEcho,
} from "@/lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message";
import { HOME_MISSING_ROOM_SUMMARY_DEBOUNCE_MS } from "@/lib/community-messenger/home/community-messenger-home-constants";
import { communityMessengerRoomIsTrade } from "@/lib/community-messenger/messenger-room-domain";
import type { CommunityMessengerBootstrap, CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import { onCommunityMessengerBusEvent, type MessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { requestMessengerHomeListMergeFromHomeSummary } from "@/lib/community-messenger/request-messenger-home-list-merge-from-summary";
import { cmReadBadgeLog, setLocalReadGuard } from "@/lib/community-messenger/read/local-read-guard";
import {
  applyIncomingMessageEvent,
  applyRoomReadEvent,
  applyRoomSummaryPatched,
  getMessengerRealtimeRoomSummary,
  normalizeMessengerRealtimeRoomId,
} from "@/lib/community-messenger/stores/messenger-realtime-store";
import {
  type CommunityMessengerHomeRealtimeMessageInsertHint,
  type CommunityMessengerHomeRealtimeParticipantUnreadHint,
  useCommunityMessengerHomeRealtime,
} from "@/lib/community-messenger/use-community-messenger-realtime";
import { cmRtStableSubLog } from "@/lib/community-messenger/realtime/cm-rt-stable-sub-log";

const HOME_SUMMARY_MIN_FETCH_GAP_MS = 1_500;
let cmHomeRealtimeRefreshScheduleOrdinal = 0;

/**
 * Phase1 가 연속으로 `cm.room.read` → `cm.room.local_unread`(0) 를 보낼 때
 * 동일 스택에서 중복으로 `applyRoomSummaryPatched`·`setData` 가 도는 것을 막는다.
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
  homeRealtimeGateOpen: boolean;
  refresh: (silent?: boolean) => Promise<void>;
  setData: Dispatch<SetStateAction<CommunityMessengerBootstrap | null>>;
};

/**
 * 홈 방 목록 부트스트랩에 대한 Realtime 메시지/참가자 unread 패치 및 누락 방 home-summary 병합.
 * `CommunityMessengerHome` 본문에서 네트워크·캐시 갱신 경계만 분리한다.
 */
export function useCommunityMessengerHomeRealtimeBootstrapList({
  userId,
  roomIds,
  extraRoomIds,
  homeRealtimeGateOpen,
  refresh,
  setData,
}: UseCommunityMessengerHomeRealtimeBootstrapListArgs): void {
  const homeMissingRoomSummaryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const homeSummaryLastFetchAtRef = useRef<Map<string, number>>(new Map());
  const homeRealtimeRefreshLastAtRef = useRef(0);
  const homeRealtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
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
    cmHomeRealtimeRefreshScheduleOrdinal += 1;
    cmRtStableSubLog("home_realtime_refresh_schedule", {
      scheduleOrdinal: cmHomeRealtimeRefreshScheduleOrdinal,
      atMs: Date.now(),
    });
    const now = Date.now();
    const elapsed = now - homeRealtimeRefreshLastAtRef.current;
    const minGapMs = 280;
    if (elapsed >= minGapMs) {
      homeRealtimeRefreshLastAtRef.current = now;
      void refresh(true);
      return;
    }
    if (homeRealtimeRefreshTimerRef.current != null) return;
    homeRealtimeRefreshTimerRef.current = setTimeout(() => {
      homeRealtimeRefreshTimerRef.current = null;
      homeRealtimeRefreshLastAtRef.current = Date.now();
      void refresh(true);
    }, minGapMs - elapsed);
  }, [refresh]);

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
            setData((prev) => {
              if (!prev) return prev;
              const merged = mergeBootstrapRoomSummaryIntoLists(prev, json.room!);
              if (merged === prev) return prev;
              primeBootstrapCache(merged);
              return merged;
            });
          } catch {
            /* ignore */
          }
        })();
      }, HOME_MISSING_ROOM_SUMMARY_DEBOUNCE_MS);
      timers.set(id, t);
    },
    [setData]
  );

  const applyRealtimeMessageListBatch = useCallback(
    (batch: CommunityMessengerHomeRealtimeMessageInsertHint[]) => {
      if (batch.length === 0) return;
      const missedRooms = new Set<string>();
      const me = String(userId ?? "").trim();
      const summaryMap = new Map<string, CommunityMessengerRoomSummary>();
      for (const hint of batch) {
        const rid = String(hint.roomId ?? "").trim();
        if (!rid) continue;
        applyIncomingMessageEvent({
          viewerUserId: me || null,
          roomId: rid,
          messageRow: hint.newRecord,
        });
        const summary = getMessengerRealtimeRoomSummary(rid);
        if (summary) summaryMap.set(rid, summary);
      }
      setData((prev) => {
        if (!prev) return prev;
        let cur = prev;
        for (const hint of batch) {
          const rid = String(hint.roomId ?? "").trim();
          const summary = rid ? summaryMap.get(rid) ?? null : null;
          if (summary) {
            cur = mergeBootstrapRoomSummaryIntoLists(cur, summary);
            continue;
          }
          const senderRaw =
            hint.newRecord && typeof hint.newRecord.sender_id === "string"
              ? hint.newRecord.sender_id.trim()
              : "";
          const isMine = Boolean(me && senderRaw && messengerUserIdsEqual(senderRaw, me));
          const next = patchBootstrapRoomListForRealtimeMessageInsert(cur, hint.roomId, hint.newRecord, {
            boostUnreadCount: !isMine,
          });
          if (next === cur) {
            if (rid && !bootstrapHasRoomRow(cur, rid)) missedRooms.add(rid);
          } else {
            cur = next;
          }
        }
        if (cur === prev) return prev;
        primeBootstrapCache(cur);
        return cur;
      });
      for (const rid of missedRooms) {
        if (rid) scheduleHomeMissingRoomSummaryMerge(rid);
      }
    },
    [setData, scheduleHomeMissingRoomSummaryMerge, userId]
  );

  const applyParticipantUnreadDelta = useCallback(
    (hint: CommunityMessengerHomeRealtimeParticipantUnreadHint) => {
      const rid = String(hint.roomId ?? "").trim();
      cmRtReadSyncLog("list_unread_increment_apply", {
        roomId: rid,
        viewerUserId: String(userId ?? "").trim() || null,
        unreadCount: hint.unreadCount,
        lastReadMessageId: hint.lastReadMessageId ?? null,
        lastReadAt: hint.lastReadAt ?? null,
        channelScope: "home_meta_self_delta",
      });
      applyRoomSummaryPatched({
        viewerUserId: String(userId ?? "").trim() || null,
        roomId: rid,
        unreadCount: hint.unreadCount,
        lastReadMessageId: hint.lastReadMessageId,
      });
      const latestSummary = rid ? getMessengerRealtimeRoomSummary(rid) : null;
      setData((prev) => {
        if (!prev) return prev;
        const hintNorm = normalizeMessengerRealtimeRoomId(hint.roomId);
        const existing = [...prev.chats, ...prev.groups].find(
          (r) => normalizeMessengerRealtimeRoomId(r.id) === hintNorm
        );
        const summary = latestSummary;
        if (!summary) {
          queueMicrotask(() => {
            if (rid) scheduleHomeMissingRoomSummaryMerge(rid);
            requestMessengerHubBadgeResync("participant_unread_changed");
          });
          return prev;
        }
        const next = mergeBootstrapRoomSummaryIntoLists(prev, summary);
        primeBootstrapCache(next);
        queueMicrotask(() => {
          if (existing && communityMessengerRoomIsTrade(existing)) {
            scheduleHomeMissingRoomSummaryMerge(existing.id);
          }
          requestMessengerHubBadgeResync("participant_unread_changed");
        });
        return next;
      });
    },
    [scheduleHomeMissingRoomSummaryMerge, setData, userId]
  );

  useEffect(() => {
    const me = userId?.trim();
    if (!me || !homeRealtimeGateOpen) return;
    return onCommunityMessengerBusEvent((ev: MessengerBusEvent) => {
      if (ev.type === "cm.room.bump") return;

      if (ev.type === "cm.home.merge_room_summary") {
        if (String(ev.viewerUserId) !== me) return;
        setData((prev) => {
          if (!prev) return prev;
          const next = mergeBootstrapRoomSummaryIntoLists(prev, ev.summary);
          if (next === prev) return prev;
          primeBootstrapCache(next);
          return next;
        });
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
        applyRoomSummaryPatched({
          viewerUserId: me,
          roomId: ev.roomId,
          unreadCount: ev.unreadCount,
        });
        let tradeRoomForLegacyUnreadResync: string | null = null;
        let missedList = false;
        setData((prev) => {
          if (!prev) return prev;
          let hit = false;
          const evRoomNorm = normalizeMessengerRealtimeRoomId(ev.roomId);
          const patchRooms = (rooms: CommunityMessengerRoomSummary[]) =>
            rooms.map((room) => {
              if (normalizeMessengerRealtimeRoomId(room.id) !== evRoomNorm) return room;
              hit = true;
              if (communityMessengerRoomIsTrade(room)) tradeRoomForLegacyUnreadResync = room.id;
              return { ...room, unreadCount: ev.unreadCount };
            });
          const next = { ...prev, chats: patchRooms(prev.chats), groups: patchRooms(prev.groups) };
          if (!hit) {
            missedList = true;
            return prev;
          }
          primeBootstrapCache(next);
          return next;
        });
        if (missedList) scheduleHomeMissingRoomSummaryMerge(ev.roomId);
        else if (tradeRoomForLegacyUnreadResync) {
          scheduleHomeMissingRoomSummaryMerge(tradeRoomForLegacyUnreadResync);
        }
        return;
      }

      if (ev.type === "cm.room.incoming_message") {
        if (String(ev.viewerUserId) !== me) return;
        applyIncomingMessageEvent({
          viewerUserId: me,
          roomId: ev.roomId,
          messageRow: ev.messageRow,
        });
        const summary = getMessengerRealtimeRoomSummary(ev.roomId);
        if (!summary) {
          scheduleHomeMissingRoomSummaryMerge(ev.roomId);
          return;
        }
        setData((prev) => {
          if (!prev) return prev;
          const next = mergeBootstrapRoomSummaryIntoLists(prev, summary);
          if (next === prev) return prev;
          primeBootstrapCache(next);
          return next;
        });
        return;
      }

      if (ev.type === "cm.room.summary_patch") {
        if (String(ev.viewerUserId) !== me) return;
        applyRoomSummaryPatched({
          viewerUserId: me,
          roomId: ev.roomId,
          unreadCount: ev.unreadCount,
          lastReadMessageId: ev.lastReadMessageId,
        });
        const summary = getMessengerRealtimeRoomSummary(ev.roomId);
        if (!summary) {
          scheduleHomeMissingRoomSummaryMerge(ev.roomId);
          return;
        }
        setData((prev) => {
          if (!prev) return prev;
          const next = mergeBootstrapRoomSummaryIntoLists(prev, summary);
          if (next === prev) return prev;
          primeBootstrapCache(next);
          return next;
        });
        return;
      }

      if (ev.type === "cm.room.read") {
        if (String(ev.viewerUserId) !== me) return;
        const summaryBefore = getMessengerRealtimeRoomSummary(ev.roomId);
        setLocalReadGuard({
          roomId: ev.roomId,
          referenceLastMessageAt: String(summaryBefore?.lastMessageAt ?? ""),
          source: "bus_sync",
        });
        cmReadBadgeLog("read_bus_receive", { roomId: ev.roomId });
        applyRoomReadEvent({
          viewerUserId: me,
          roomId: ev.roomId,
          lastReadMessageId: ev.lastReadMessageId,
        });
        const summary = getMessengerRealtimeRoomSummary(ev.roomId);
        if (!summary) {
          scheduleHomeMissingRoomSummaryMerge(ev.roomId);
          return;
        }
        setData((prev) => {
          if (!prev) return prev;
          const next = mergeBootstrapRoomSummaryIntoLists(prev, summary);
          if (next === prev) return prev;
          primeBootstrapCache(next);
          return next;
        });
        registerBusRoomReadUnreadZeroForDedupe(ev.roomId);
        return;
      }

      if (ev.type === "cm.room.message_sent") {
        if (!ev.senderUserId || String(ev.senderUserId) !== me) return;
        applyRoomReadEvent({ viewerUserId: me, roomId: ev.roomId });
        let missedEcho = false;
        setData((prev) => {
          if (!prev) return prev;
          const next = patchBootstrapRoomListForSenderLocalEcho(prev, ev.roomId, ev.listPreview ?? null);
          if (next === prev) {
            missedEcho = true;
            return prev;
          }
          primeBootstrapCache(next);
          return next;
        });
        if (missedEcho) {
          void requestMessengerHomeListMergeFromHomeSummary(ev.roomId, "sender_echo_room_missing");
        }
      }
    });
  }, [homeRealtimeGateOpen, scheduleHomeMissingRoomSummaryMerge, setData, userId]);

  useCommunityMessengerHomeRealtime({
    userId: userId ?? null,
    roomIds,
    extraRoomIds,
    enabled: Boolean(userId) && homeRealtimeGateOpen,
    onRefresh: scheduleHomeRealtimeRefresh,
    onRealtimeMessageInsertBatch: applyRealtimeMessageListBatch,
    onParticipantUnreadDelta: applyParticipantUnreadDelta,
  });
}
