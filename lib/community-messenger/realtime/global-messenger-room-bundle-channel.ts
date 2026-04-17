"use client";

/**
 * 시청자(viewer)당 **단일** Supabase Realtime 채널 — 방 이동마다
 * `community-messenger-room:bundle:${viewer}:${roomId}` 가 늘어나며
 * WS·핸들러가 누적되는 문제를 막는다. postgres_changes 는 테이블 단위로 수신하고
 * `room_id` / `id` 로 메시지·메타·통화 이벤트를 해당 방 리스너에만 라우팅한다.
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

export type GlobalRoomRealtimeListenerRef = MutableRefObject<{
  onRefresh: () => void;
  onMessageEvent?: (event: CommunityMessengerRoomRealtimeMessageEvent) => void;
}>;

type RoomSchedulers = {
  messageFallback: ReturnType<typeof createRefreshScheduler>;
  meta: ReturnType<typeof createRefreshScheduler>;
  roomCallBundle: ReturnType<typeof createRefreshScheduler>;
  voice: ReturnType<typeof createRefreshScheduler>;
  subscribedResync: ReturnType<typeof createRefreshScheduler>;
};

export type GlobalMessengerRoomBundleEntry = {
  authEpoch: number;
  viewerForChannel: string;
  listenersByRoom: Map<string, Set<GlobalRoomRealtimeListenerRef>>;
  roomSchedulers: Map<string, RoomSchedulers>;
  /** `SUBSCRIBED` 이후 — 이후에 붙은 방 리스너는 즉시 `onRefresh` 로 동기화 */
  channelSubscribed: boolean;
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
  authEpoch: number;
  /** `stop()` 시 레지스트리에서 제거(인증 epoch 교체 등) */
  onStopped?: () => void;
}): GlobalMessengerRoomBundleEntry {
  const sb = getSupabaseClient();
  const entry: GlobalMessengerRoomBundleEntry = {
    authEpoch: args.authEpoch,
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

  const bindGlobalRoomBundle = () => {
    if (cancelled || roomBound) return;
    roomBound = true;

    const firstSubscribeResync = createRefreshScheduler(
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
      firstSubscribeResync.cancel();
    };

    let bundleSubscribedCount = 0;
    const roomBundle = subscribeWithRetry({
      sb,
      name: `global-messenger:bundle:${args.viewerForChannel}`,
      logStreamRoomId: args.viewerForChannel,
      scope: "community-messenger-room:global-bundle",
      isCancelled: () => cancelled,
      onStatus: (status) => {
        if (status !== "SUBSCRIBED" || cancelled) return;
        entry.channelSubscribed = true;
        bundleSubscribedCount += 1;
        if (bundleSubscribedCount === 1) {
          for (const rid of entry.listenersByRoom.keys()) {
            emitRoomRefreshForRoom(entry, rid);
          }
        } else {
          firstSubscribeResync.schedule();
        }
      },
      onAfterSubscribeFailure: (_status, attempt) => {
        if (cancelled) return;
        if (attempt >= 2) {
          for (const rid of entry.listenersByRoom.keys()) {
            getOrCreateRoomSchedulers(entry, rid).messageFallback.schedule();
          }
        }
      },
      build: (channel: RealtimeChannel) => {
        let c = channel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "community_messenger_messages" },
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
          { event: "*", schema: "public", table: "community_messenger_participants" },
          (payload) => {
            const row = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            const rid = typeof row?.room_id === "string" ? row.room_id.trim() : "";
            const roomKey = normalizeRoomKey(rid);
            if (!roomKey || !entry.listenersByRoom.has(roomKey)) return;
            if (!cancelled) getOrCreateRoomSchedulers(entry, roomKey).meta.schedule();
          }
        );

        c = c.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "community_messenger_rooms" },
          (payload) => {
            const row = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
            const rid = typeof row?.id === "string" ? row.id.trim() : "";
            const roomKey = normalizeRoomKey(rid);
            if (!roomKey || !entry.listenersByRoom.has(roomKey)) return;
            if (!cancelled) getOrCreateRoomSchedulers(entry, roomKey).meta.schedule();
          }
        );

        c = c
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "community_messenger_call_logs" },
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
            { event: "*", schema: "public", table: "community_messenger_call_sessions" },
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
            { event: "*", schema: "public", table: "community_messenger_call_session_participants" },
            (payload) => {
              const row = (payload.new ?? payload.old) as Record<string, unknown> | undefined;
              const rid = typeof row?.room_id === "string" ? row.room_id.trim() : "";
              const roomKey = normalizeRoomKey(rid);
              if (!roomKey || !entry.listenersByRoom.has(roomKey)) return;
              if (!cancelled) getOrCreateRoomSchedulers(entry, roomKey).roomCallBundle.schedule();
            }
          );

        return c;
      },
    });

    if (cancelled) {
      roomBundle.stop();
      return;
    }
    channels.push(roomBundle);
  };

  authBridgeCleanup = createRealtimeAuthBridge({
    sb,
    isCancelled: () => cancelled,
    onReady: bindGlobalRoomBundle,
  });

  entry.stop = () => {
    cancelled = true;
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
    for (const bundle of channels) bundle.stop();
    channels.length = 0;
    args.onStopped?.();
  };

  return entry;
}
