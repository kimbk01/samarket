"use client";

/**
 * 시청자(viewer)당 Realtime 채널을 **열려 있는 방 id 청크** 단위로만 유지한다.
 * `postgres_changes`에는 항상 `room_id=in.(…)` / `id=in.(…)` 필터를 걸어 전 테이블 구독을 피한다.
 * 방 리스너 추가·제거 시 `notifyRoomListenersChanged()` 로 청크를 재바인딩한다.
 *
 * `useMessengerRoomClientPhase1` → `useMessengerRoomRealtimeMessageIngest` →
 * `useCommunityMessengerRoomRealtime` 경로에서 사용한다.
 */

import type { MutableRefObject } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createRealtimeAuthBridge } from "@/lib/community-messenger/realtime/community-messenger-realtime-auth-bridge";
import { mapRealtimeMessageRow } from "@/lib/community-messenger/realtime/community-messenger-room-message-realtime-channel";
import {
  cmRtLogMapRowSkipped,
  cmRtLogPostgresPayload,
  isCommunityMessengerRealtimeDebugEnabled,
} from "@/lib/community-messenger/realtime/community-messenger-realtime-debug";
import { messengerMonitorRealtimeMessageInsertDelay } from "@/lib/community-messenger/monitoring/client";
import type { CommunityMessengerRoomRealtimeMessageEvent } from "@/lib/community-messenger/realtime/community-messenger-realtime-types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeWithRetry } from "@/lib/community-messenger/realtime/subscribe-with-retry";
import {
  MESSENGER_MESSAGE_FALLBACK_DEBOUNCE_MS,
  MESSENGER_ROOM_CALL_REALTIME_BUNDLE_DEBOUNCE_MS,
  MESSENGER_ROOM_META_DEBOUNCE_MS,
  MESSENGER_ROOM_REALTIME_RESUBSCRIBE_RESYNC_DEBOUNCE_MS,
  MESSENGER_VOICE_AUX_DEBOUNCE_MS,
} from "@/lib/community-messenger/messenger-latency-config";
import { createRefreshScheduler } from "@/lib/community-messenger/realtime/community-messenger-realtime-schedulers";
import { recordMessengerGlobalBundleSupabaseChannelGaugeDelta } from "@/lib/runtime/samarket-runtime-debug";
import { cmRtReadSyncLog } from "@/lib/community-messenger/read/cm-rt-read-sync-log";

/** Supabase postgres_changes `in` 필터 값 한도 — Realtime 채널 수와 WAL 부하 균형 */
const GLOBAL_MESSENGER_ROOM_POSTGRES_IN_FILTER_MAX = 50;

export type GlobalRoomRealtimeListenerRef = MutableRefObject<{
  onRefresh: () => void;
  onMessageEvent?: (event: CommunityMessengerRoomRealtimeMessageEvent) => void;
  /**
   * `community_messenger_participants` postgres_changes — 상대 읽음 커서 등 HTTP refresh 없이 즉시 병합.
   * @see useMessengerRoomClientPhase1 읽음 라벨 동기화
   */
  onParticipantPostgres?: (payload: {
    eventType: string;
    roomId: string;
    newRecord: Record<string, unknown> | null;
    oldRecord: Record<string, unknown> | null;
  }) => void;
}>;

type RoomSchedulers = {
  messageFallback: ReturnType<typeof createRefreshScheduler>;
  meta: ReturnType<typeof createRefreshScheduler>;
  roomCallBundle: ReturnType<typeof createRefreshScheduler>;
  voice: ReturnType<typeof createRefreshScheduler>;
  subscribedResync: ReturnType<typeof createRefreshScheduler>;
};

export type GlobalMessengerRoomBundleEntry = {
  viewerForChannel: string;
  listenersByRoom: Map<string, Set<GlobalRoomRealtimeListenerRef>>;
  roomSchedulers: Map<string, RoomSchedulers>;
  /** `SUBSCRIBED` 이후 — 이후에 붙은 방 리스너는 즉시 `onRefresh` 로 동기화 */
  channelSubscribed: boolean;
  /** `listenersByRoom` 변경 후 디바운스하여 필터된 postgres 청크를 맞춘다 */
  notifyRoomListenersChanged?: () => void;
  stop: () => void;
};

function normalizeRoomKey(roomId: string): string {
  return roomId.trim().toLowerCase();
}

function emitRoomMessageForRoom(
  entry: GlobalMessengerRoomBundleEntry,
  streamRoomId: string,
  event: CommunityMessengerRoomRealtimeMessageEvent
): void {
  const key = normalizeRoomKey(streamRoomId);
  const set = entry.listenersByRoom.get(key);
  if (!set) return;
  for (const ref of set) ref.current.onMessageEvent?.(event);
}

function emitRoomRefreshForRoom(entry: GlobalMessengerRoomBundleEntry, streamRoomId: string): void {
  const key = normalizeRoomKey(streamRoomId);
  const set = entry.listenersByRoom.get(key);
  if (!set) return;
  for (const ref of set) ref.current.onRefresh();
}

function emitRoomParticipantPostgresForRoom(
  entry: GlobalMessengerRoomBundleEntry,
  streamRoomId: string,
  payload: { eventType: string; new: unknown; old: unknown }
): void {
  const key = normalizeRoomKey(streamRoomId);
  const set = entry.listenersByRoom.get(key);
  if (!set) return;
  const newRecord = payload.new && typeof payload.new === "object" ? (payload.new as Record<string, unknown>) : null;
  const oldRecord = payload.old && typeof payload.old === "object" ? (payload.old as Record<string, unknown>) : null;
  for (const ref of set) {
    ref.current.onParticipantPostgres?.({
      eventType: payload.eventType,
      roomId: streamRoomId.trim(),
      newRecord,
      oldRecord,
    });
  }
}

function getOrCreateRoomSchedulers(entry: GlobalMessengerRoomBundleEntry, roomKey: string): RoomSchedulers {
  const existing = entry.roomSchedulers.get(roomKey);
  if (existing) return existing;
  const s: RoomSchedulers = {
    messageFallback: createRefreshScheduler(
      { current: () => emitRoomRefreshForRoom(entry, roomKey) },
      MESSENGER_MESSAGE_FALLBACK_DEBOUNCE_MS
    ),
    meta: createRefreshScheduler(
      { current: () => emitRoomRefreshForRoom(entry, roomKey) },
      MESSENGER_ROOM_META_DEBOUNCE_MS
    ),
    roomCallBundle: createRefreshScheduler(
      { current: () => emitRoomRefreshForRoom(entry, roomKey) },
      MESSENGER_ROOM_CALL_REALTIME_BUNDLE_DEBOUNCE_MS
    ),
    voice: createRefreshScheduler(
      { current: () => emitRoomRefreshForRoom(entry, roomKey) },
      MESSENGER_VOICE_AUX_DEBOUNCE_MS
    ),
    subscribedResync: createRefreshScheduler(
      { current: () => emitRoomRefreshForRoom(entry, roomKey) },
      MESSENGER_ROOM_REALTIME_RESUBSCRIBE_RESYNC_DEBOUNCE_MS
    ),
  };
  entry.roomSchedulers.set(roomKey, s);
  return s;
}

/** 방 단위 스케줄러 정리 — 리스너가 0일 때만 호출 */
export function disposeGlobalMessengerRoomSchedulers(entry: GlobalMessengerRoomBundleEntry, roomKeyNorm: string): void {
  const sched = entry.roomSchedulers.get(roomKeyNorm);
  if (!sched) return;
  sched.messageFallback.cancel();
  sched.meta.cancel();
  sched.roomCallBundle.cancel();
  sched.voice.cancel();
  sched.subscribedResync.cancel();
  entry.roomSchedulers.delete(roomKeyNorm);
}

export function createGlobalMessengerRoomBundleEntry(args: {
  viewerForChannel: string;
  /** `stop()` 시 레지스트리에서 제거 */
  onStopped?: () => void;
}): GlobalMessengerRoomBundleEntry {
  const sb = getSupabaseClient();
  const entry: GlobalMessengerRoomBundleEntry = {
    viewerForChannel: args.viewerForChannel,
    listenersByRoom: new Map(),
    roomSchedulers: new Map(),
    channelSubscribed: false,
    stop: () => undefined,
  };
  if (!sb) return entry;

  let cancelled = false;
  const channels: Array<{ stop: () => void }> = [];
  let cancelBundleSchedulers: (() => void) | null = null;
  let authBridgeCleanup: (() => void) | null = null;
  let roomBound = false;
  let postgresBindGeneration = 0;
  let notifyDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let firstSubscribeResync: ReturnType<typeof createRefreshScheduler> | null = null;

  const clearNotifyDebounce = () => {
    if (notifyDebounceTimer == null) return;
    clearTimeout(notifyDebounceTimer);
    notifyDebounceTimer = null;
  };

  const attachFilteredPostgresHandlers = (
    channel: RealtimeChannel,
    roomScopedFilter: string,
    roomsTableFilter: string
  ): RealtimeChannel => {
    let c = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "community_messenger_messages", filter: roomScopedFilter },
      (payload) => {
        const eventType = payload.eventType;
        const rawNew = payload.new as Record<string, unknown> | undefined;
        const rawOld = payload.old as Record<string, unknown> | undefined;
        const rowForId = eventType === "DELETE" ? rawOld : rawNew;
        const payloadRoomId = typeof rowForId?.room_id === "string" ? rowForId.room_id.trim() : "";
        const mappedId = rowForId && typeof rowForId.id === "string" ? rowForId.id : null;
        const rid = payloadRoomId;
        const roomKey = normalizeRoomKey(rid);
        if (!roomKey || !entry.listenersByRoom.has(roomKey)) return;

        if (isCommunityMessengerRealtimeDebugEnabled()) {
          cmRtLogPostgresPayload({
            filterRoomId: rid,
            eventType,
            table: "community_messenger_messages",
            messageId: mappedId,
            payloadRoomId,
            filterMatchesPayloadRoom: true,
          });
        }
        const sched = getOrCreateRoomSchedulers(entry, roomKey);
        const nextMessage =
          eventType === "DELETE"
            ? mapRealtimeMessageRow(payload.old as Record<string, unknown> | undefined)
            : mapRealtimeMessageRow(payload.new as Record<string, unknown> | undefined);
        if (!nextMessage && isCommunityMessengerRealtimeDebugEnabled()) {
          cmRtLogMapRowSkipped({
            reason: "mapRealtimeMessageRow_null",
            rawKeys: rowForId && typeof rowForId === "object" ? Object.keys(rowForId) : [],
          });
        }
        if (nextMessage) {
          emitRoomMessageForRoom(entry, rid, { eventType, message: nextMessage });
          if (eventType === "INSERT" && rid) {
            const created = new Date(nextMessage.createdAt).getTime();
            const delay = Date.now() - created;
            if (delay >= 0 && delay < 180_000) {
              messengerMonitorRealtimeMessageInsertDelay(rid, delay);
            }
          }
          if (nextMessage.messageType === "call_stub" && !cancelled) {
            sched.roomCallBundle.schedule();
          }
          if (nextMessage.messageType === "voice" && eventType === "INSERT" && !cancelled) {
            sched.voice.schedule();
          }
          return;
        }
        if (!cancelled) sched.messageFallback.schedule();
      }
    );

    c = c.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "community_messenger_message_reactions",
        filter: roomScopedFilter,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
        const rid = typeof row?.room_id === "string" ? row.room_id.trim() : "";
        const roomKey = normalizeRoomKey(rid);
        if (!roomKey || !entry.listenersByRoom.has(roomKey)) return;
        if (!cancelled) getOrCreateRoomSchedulers(entry, roomKey).messageFallback.schedule();
      }
    );

    c = c.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "community_messenger_participants",
        filter: roomScopedFilter,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
        const rid = typeof row?.room_id === "string" ? row.room_id.trim() : "";
        const roomKey = normalizeRoomKey(rid);
        if (!roomKey || !entry.listenersByRoom.has(roomKey)) {
          cmRtReadSyncLog("event_ignored_reason", {
            roomId: rid || null,
            channelScope: "room_bundle",
            ignoredReason: !roomKey ? "no_room_id_in_row" : "no_listeners_for_room_key",
          });
          return;
        }
        if (!cancelled) {
          const newR = payload.new && typeof payload.new === "object" ? (payload.new as Record<string, unknown>) : null;
          const uid =
            newR && typeof newR.user_id === "string" ? newR.user_id.trim() : String(newR?.user_id ?? "").trim() || null;
          const lrm = newR && typeof newR.last_read_message_id === "string" ? newR.last_read_message_id.trim() : null;
          const lra = newR && typeof newR.last_read_at === "string" ? newR.last_read_at.trim() : null;
          const unc =
            newR && typeof newR.unread_count !== "undefined"
              ? Math.max(0, Number(newR.unread_count ?? 0) || 0)
              : null;
          cmRtReadSyncLog("participant_update_received", {
            channelScope: "room_bundle",
            roomId: rid,
            participantUserId: uid,
            lastReadMessageId: lrm,
            lastReadAt: lra,
            unreadCount: unc,
            eventType: payload.eventType,
          });
          getOrCreateRoomSchedulers(entry, roomKey).meta.schedule();
          emitRoomParticipantPostgresForRoom(entry, rid, {
            eventType: payload.eventType,
            new: payload.new,
            old: payload.old,
          });
        }
      }
    );

    c = c.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "community_messenger_rooms",
        filter: roomsTableFilter,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
        const rid = typeof row?.id === "string" ? row.id.trim() : "";
        const roomKey = normalizeRoomKey(rid);
        if (!roomKey || !entry.listenersByRoom.has(roomKey)) return;
        if (!cancelled) getOrCreateRoomSchedulers(entry, roomKey).meta.schedule();
      }
    );

    return c
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messenger_call_logs",
          filter: roomScopedFilter,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
          const rid = typeof row?.room_id === "string" ? row.room_id.trim() : "";
          const roomKey = normalizeRoomKey(rid);
          if (!roomKey || !entry.listenersByRoom.has(roomKey)) return;
          if (!cancelled) getOrCreateRoomSchedulers(entry, roomKey).roomCallBundle.schedule();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messenger_call_sessions",
          filter: roomScopedFilter,
        },
        (payload) => {
          const eventType = payload.eventType;
          const row = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
          const rid = typeof row?.room_id === "string" ? row.room_id.trim() : "";
          const roomKey = normalizeRoomKey(rid);
          if (!roomKey || !entry.listenersByRoom.has(roomKey)) return;
          const sched = getOrCreateRoomSchedulers(entry, roomKey);
          if (cancelled) return;
          if (eventType === "DELETE") {
            sched.roomCallBundle.cancel();
            emitRoomRefreshForRoom(entry, rid);
            return;
          }
          const next = payload.new as Record<string, unknown> | null;
          const status = typeof next?.status === "string" ? next.status.trim() : "";
          if (status === "ended" || status === "cancelled" || status === "rejected" || status === "missed") {
            sched.roomCallBundle.cancel();
            emitRoomRefreshForRoom(entry, rid);
            return;
          }
          sched.roomCallBundle.schedule();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_messenger_call_session_participants",
          filter: roomScopedFilter,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
          const rid = typeof row?.room_id === "string" ? row.room_id.trim() : "";
          const roomKey = normalizeRoomKey(rid);
          if (!roomKey || !entry.listenersByRoom.has(roomKey)) return;
          if (!cancelled) getOrCreateRoomSchedulers(entry, roomKey).roomCallBundle.schedule();
        }
      );
  };

  const bindFilteredPostgresSubscriptions = () => {
    const gen = ++postgresBindGeneration;
    const prevLen = channels.length;
    for (const ch of channels) ch.stop();
    channels.length = 0;

    try {
      const roomIds = [...entry.listenersByRoom.keys()].filter(Boolean).sort();
      if (roomIds.length === 0) {
        entry.channelSubscribed = true;
        return;
      }

      entry.channelSubscribed = false;

      const chunkCount = Math.ceil(roomIds.length / GLOBAL_MESSENGER_ROOM_POSTGRES_IN_FILTER_MAX);
      let firstWaveChunksDone = 0;
      const chunkFirstSubscribed: boolean[] = new Array(chunkCount).fill(false);

      for (let offset = 0; offset < roomIds.length; offset += GLOBAL_MESSENGER_ROOM_POSTGRES_IN_FILTER_MAX) {
        const chunk = roomIds.slice(offset, offset + GLOBAL_MESSENGER_ROOM_POSTGRES_IN_FILTER_MAX);
        const chunkIndex = offset / GLOBAL_MESSENGER_ROOM_POSTGRES_IN_FILTER_MAX;
        const roomScopedFilter = `room_id=in.(${chunk.join(",")})`;
        const roomsTableFilter = `id=in.(${chunk.join(",")})`;

        const roomBundle = subscribeWithRetry({
          sb,
          name: `global-messenger:bundle:${args.viewerForChannel}:${chunkIndex}`,
          logStreamRoomId: args.viewerForChannel,
          scope: "community-messenger-room:global-bundle",
          isCancelled: () => cancelled || gen !== postgresBindGeneration,
          onStatus: (status) => {
            if (gen !== postgresBindGeneration || cancelled) return;
            if (status !== "SUBSCRIBED") return;
            if (!chunkFirstSubscribed[chunkIndex]) {
              chunkFirstSubscribed[chunkIndex] = true;
              firstWaveChunksDone += 1;
              if (firstWaveChunksDone === 1) {
                for (const rid of entry.listenersByRoom.keys()) {
                  emitRoomRefreshForRoom(entry, rid);
                }
              } else {
                firstSubscribeResync?.schedule();
              }
              if (firstWaveChunksDone === chunkCount) {
                entry.channelSubscribed = true;
              }
            } else {
              firstSubscribeResync?.schedule();
            }
          },
          onAfterSubscribeFailure: (_status, attempt) => {
            if (cancelled || gen !== postgresBindGeneration) return;
            if (attempt >= 2) {
              for (const rid of entry.listenersByRoom.keys()) {
                getOrCreateRoomSchedulers(entry, rid).messageFallback.schedule();
              }
            }
          },
          build: (channel: RealtimeChannel) => attachFilteredPostgresHandlers(channel, roomScopedFilter, roomsTableFilter),
        });

        if (cancelled || gen !== postgresBindGeneration) {
          roomBundle.stop();
          break;
        }
        channels.push(roomBundle);
      }

      if (cancelled || gen !== postgresBindGeneration) return;
      if (channels.length === 0) {
        entry.channelSubscribed = true;
      }
    } finally {
      recordMessengerGlobalBundleSupabaseChannelGaugeDelta(channels.length - prevLen);
    }
  };

  const bindGlobalRoomBundle = () => {
    if (cancelled || roomBound) return;
    roomBound = true;
    firstSubscribeResync = createRefreshScheduler(
      {
        current: () => {
          for (const rid of entry.listenersByRoom.keys()) {
            emitRoomRefreshForRoom(entry, rid);
          }
        },
      },
      MESSENGER_ROOM_REALTIME_RESUBSCRIBE_RESYNC_DEBOUNCE_MS
    );
    cancelBundleSchedulers = () => {
      firstSubscribeResync?.cancel();
      firstSubscribeResync = null;
    };
    bindFilteredPostgresSubscriptions();
  };

  entry.notifyRoomListenersChanged = () => {
    if (!roomBound || cancelled) return;
    clearNotifyDebounce();
    notifyDebounceTimer = setTimeout(() => {
      notifyDebounceTimer = null;
      if (!cancelled && roomBound) bindFilteredPostgresSubscriptions();
    }, 80);
  };

  authBridgeCleanup = createRealtimeAuthBridge({
    sb,
    isCancelled: () => cancelled,
    onReady: bindGlobalRoomBundle,
  });

  entry.stop = () => {
    cancelled = true;
    postgresBindGeneration += 1;
    clearNotifyDebounce();
    authBridgeCleanup?.();
    authBridgeCleanup = null;
    cancelBundleSchedulers?.();
    cancelBundleSchedulers = null;
    for (const ch of entry.roomSchedulers.values()) {
      ch.messageFallback.cancel();
      ch.meta.cancel();
      ch.roomCallBundle.cancel();
      ch.voice.cancel();
      ch.subscribedResync.cancel();
    }
    entry.roomSchedulers.clear();
    const bundleChannelStopCount = channels.length;
    for (const bundle of channels) bundle.stop();
    channels.length = 0;
    if (bundleChannelStopCount !== 0) {
      recordMessengerGlobalBundleSupabaseChannelGaugeDelta(-bundleChannelStopCount);
    }
    args.onStopped?.();
  };

  return entry;
}
