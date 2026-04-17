"use client";

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { bindCommunityMessengerHomeRealtimeChannels } from "@/lib/community-messenger/realtime/community-messenger-home-realtime-channels";
import { createRealtimeAuthBridge } from "@/lib/community-messenger/realtime/community-messenger-realtime-auth-bridge";
import {
  createGlobalMessengerRoomBundleEntry,
  disposeGlobalMessengerRoomSchedulers,
  type GlobalMessengerRoomBundleEntry,
} from "@/lib/community-messenger/realtime/global-messenger-room-bundle-channel";
import type {
  CommunityMessengerHomeRealtimeMessageInsertHint,
  CommunityMessengerHomeRealtimeParticipantUnreadHint,
  CommunityMessengerRoomRealtimeMessageEvent,
} from "@/lib/community-messenger/realtime/community-messenger-realtime-types";
import { getSupabaseClient } from "@/lib/supabase/client";
import { SAMARKET_REALTIME_TOKEN_REFRESH_EVENT } from "@/lib/supabase/realtime-auth-events";
import { cmRtLogAuthEpochBump } from "@/lib/community-messenger/realtime/community-messenger-realtime-debug";
import {
  bumpMessengerRealtimeLocalUnreadForRoom,
  clearMessengerRealtimeLocalUnreadForRoom,
  getMessengerRealtimeFocusedRoomIdNorm,
} from "@/lib/community-messenger/realtime/messenger-realtime-client-activity-ref";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import { playCoalescedChatNotificationSound } from "@/lib/notifications/coalesced-chat-alert-sound";
import { shouldSuppressMessengerInAppSoundOnTradeExplorationSurface } from "@/lib/notifications/samarket-messenger-notification-regulations";
import { applyIncomingMessageEvent } from "@/lib/community-messenger/stores/messenger-realtime-store";

export type {
  CommunityMessengerHomeRealtimeMessageInsertHint,
  CommunityMessengerHomeRealtimeParticipantUnreadHint,
  CommunityMessengerRoomRealtimeMessageEvent,
  CommunityMessengerRoomRealtimeMessageRow,
} from "@/lib/community-messenger/realtime/community-messenger-realtime-types";

type HomeRealtimeListener = {
  onRefresh: () => void;
  onRealtimeMessageInsert?: (hint: CommunityMessengerHomeRealtimeMessageInsertHint) => void;
  /** 등록 시 단일 콜백보다 우선 — 프레임당 1회 배치 전달로 `setState` 병합에 사용 */
  onRealtimeMessageInsertBatch?: (hints: CommunityMessengerHomeRealtimeMessageInsertHint[]) => void;
  onParticipantUnreadDelta?: (hint: CommunityMessengerHomeRealtimeParticipantUnreadHint) => void;
};

type RoomRealtimeListener = {
  onRefresh: () => void;
  onMessageEvent?: (event: CommunityMessengerRoomRealtimeMessageEvent) => void;
};

type HomeRealtimeEntry = {
  authEpoch: number;
  listeners: Set<MutableRefObject<HomeRealtimeListener>>;
  insertHintBatchQueue: CommunityMessengerHomeRealtimeMessageInsertHint[];
  insertBatchRafId: number | null;
  stop: () => void;
};

const homeRealtimeEntries = new Map<string, HomeRealtimeEntry>();
const globalMessengerRoomBundleByViewer = new Map<string, GlobalMessengerRoomBundleEntry>();

/** INSERT 힌트 폭주 시 한 프레임 작업량 상한 — 이후 큐는 다음 rAF에서 이어 처리 */
const HOME_REALTIME_MESSAGE_INSERT_FLUSH_MAX_BATCH = 50;

function emitHomeRefresh(entry: HomeRealtimeEntry): void {
  for (const listener of entry.listeners) {
    listener.current.onRefresh();
  }
}

function flushHomeMessageInsertBatch(entry: HomeRealtimeEntry): void {
  const batch = entry.insertHintBatchQueue.splice(0, HOME_REALTIME_MESSAGE_INSERT_FLUSH_MAX_BATCH);
  if (batch.length === 0) return;
  for (const listener of entry.listeners) {
    const batchFn = listener.current.onRealtimeMessageInsertBatch;
    if (batchFn) {
      batchFn(batch);
      continue;
    }
    const single = listener.current.onRealtimeMessageInsert;
    if (single) for (const h of batch) single(h);
  }
  if (entry.insertHintBatchQueue.length > 0) {
    entry.insertBatchRafId = requestAnimationFrame(() => {
      entry.insertBatchRafId = null;
      flushHomeMessageInsertBatch(entry);
    });
  }
}

function enqueueHomeMessageInsertForEntry(
  entry: HomeRealtimeEntry,
  hint: CommunityMessengerHomeRealtimeMessageInsertHint
): void {
  entry.insertHintBatchQueue.push(hint);
  if (entry.insertBatchRafId != null) return;
  entry.insertBatchRafId = requestAnimationFrame(() => {
    entry.insertBatchRafId = null;
    flushHomeMessageInsertBatch(entry);
  });
}

function emitHomeParticipantUnread(
  entry: HomeRealtimeEntry,
  hint: CommunityMessengerHomeRealtimeParticipantUnreadHint
): void {
  clearMessengerRealtimeLocalUnreadForRoom(hint.roomId);
  for (const listener of entry.listeners) {
    listener.current.onParticipantUnreadDelta?.(hint);
  }
}

function notifyMessengerHomeRealtimeMessageInsert(args: {
  viewerUserId: string;
  hint: CommunityMessengerHomeRealtimeMessageInsertHint;
}): void {
  const row = args.hint.newRecord;
  const roomRaw = String(args.hint.roomId ?? "").trim();
  const roomNorm = roomRaw.toLowerCase();
  const sender = typeof row.sender_id === "string" ? row.sender_id.trim() : "";
  const messageId = typeof row.id === "string" ? row.id.trim() : "";
  const viewer = args.viewerUserId.trim();
  if (!roomNorm || !viewer) return;
  if (sender && sender === viewer) return;

  applyIncomingMessageEvent({
    viewerUserId: viewer,
    roomId: roomRaw,
    messageRow: row,
  });
  postCommunityMessengerBusEvent({
    type: "cm.room.incoming_message",
    roomId: roomRaw,
    viewerUserId: viewer,
    messageRow: row,
    at: Date.now(),
  });

  const focused = getMessengerRealtimeFocusedRoomIdNorm();
  /** 동일 방 + 포그라운드(+창 포커스)일 때만 낙관 bump·톤·허브 resync 생략 — 백그라운드 동일 방은 배지·알림 유지 */
  const foreground =
    typeof document !== "undefined" &&
    document.visibilityState === "visible" &&
    (typeof document.hasFocus !== "function" || document.hasFocus());
  if (focused && focused === roomNorm && foreground) {
    return;
  }

  bumpMessengerRealtimeLocalUnreadForRoom(roomRaw);
  postCommunityMessengerBusEvent({ type: "cm.room.bump", roomId: roomRaw, at: Date.now() });
  requestMessengerHubBadgeResync("participant_unread_changed");

  const dedupeKey = `home-msg-insert:${roomNorm}:${messageId || Date.now()}`;
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  /** 포그라운드 톤·배너는 `use-message-notification-bridge`(participants) 단일 경로 — 탭 숨김만 여기서 즉시 톤 */
  const bg = typeof document !== "undefined" && document.visibilityState !== "visible";
  if (bg && !shouldSuppressMessengerInAppSoundOnTradeExplorationSurface(pathname)) {
    playCoalescedChatNotificationSound(dedupeKey, "community_direct_chat");
  }
}

function createHomeRealtimeEntry(args: {
  key: string;
  userId: string;
  roomIdsFingerprint: string;
  authEpoch: number;
}): HomeRealtimeEntry {
  const sb = getSupabaseClient();
  const entry: HomeRealtimeEntry = {
    authEpoch: args.authEpoch,
    listeners: new Set(),
    insertHintBatchQueue: [],
    insertBatchRafId: null,
    stop: () => undefined,
  };
  if (!sb) return entry;

  let cancelled = false;
  const channels: Array<{ stop: () => void }> = [];
  let cancelSchedulers: (() => void) | null = null;
  let authBridgeCleanup: (() => void) | null = null;
  let homeBound = false;

  const bindHomeChannels = () => {
    if (cancelled || homeBound) return;
    homeBound = true;
    const { channels: next, cancelSchedulers: cancel } = bindCommunityMessengerHomeRealtimeChannels({
      sb,
      userId: args.userId,
      isCancelled: () => cancelled,
      roomIdsFingerprint: args.roomIdsFingerprint,
      messageInsertHintRef: {
        current: (hint) => {
          notifyMessengerHomeRealtimeMessageInsert({ viewerUserId: args.userId, hint });
          enqueueHomeMessageInsertForEntry(entry, hint);
        },
      },
      participantUnreadDeltaRef: { current: (hint) => emitHomeParticipantUnread(entry, hint) },
      onRefreshRef: { current: () => emitHomeRefresh(entry) },
    });
    cancelSchedulers = cancel;
    for (const item of next) channels.push(item);
  };

  authBridgeCleanup = createRealtimeAuthBridge({
    sb,
    isCancelled: () => cancelled,
    onReady: bindHomeChannels,
  });

  entry.stop = () => {
    cancelled = true;
    if (entry.insertBatchRafId != null) {
      cancelAnimationFrame(entry.insertBatchRafId);
      entry.insertBatchRafId = null;
    }
    entry.insertHintBatchQueue.length = 0;
    authBridgeCleanup?.();
    authBridgeCleanup = null;
    cancelSchedulers?.();
    cancelSchedulers = null;
    for (const item of channels) item.stop();
    channels.length = 0;
    homeRealtimeEntries.delete(args.key);
  };

  return entry;
}

export function useCommunityMessengerHomeRealtime(args: {
  userId: string | null;
  roomIds?: string[];
  enabled: boolean;
  onRefresh: () => void;
  onRealtimeMessageInsert?: (hint: CommunityMessengerHomeRealtimeMessageInsertHint) => void;
  onRealtimeMessageInsertBatch?: (hints: CommunityMessengerHomeRealtimeMessageInsertHint[]) => void;
  onParticipantUnreadDelta?: (hint: CommunityMessengerHomeRealtimeParticipantUnreadHint) => void;
}) {
  const listenerRef = useRef<HomeRealtimeListener>({
    onRefresh: args.onRefresh,
    onRealtimeMessageInsert: args.onRealtimeMessageInsert,
    onRealtimeMessageInsertBatch: args.onRealtimeMessageInsertBatch,
    onParticipantUnreadDelta: args.onParticipantUnreadDelta,
  });
  const [realtimeAuthEpoch, setRealtimeAuthEpoch] = useState(0);

  const roomIdsFingerprint = [...new Set((args.roomIds ?? []).filter(Boolean))].sort().join("\0");

  useEffect(() => {
    listenerRef.current.onRefresh = args.onRefresh;
    listenerRef.current.onRealtimeMessageInsert = args.onRealtimeMessageInsert;
    listenerRef.current.onRealtimeMessageInsertBatch = args.onRealtimeMessageInsertBatch;
    listenerRef.current.onParticipantUnreadDelta = args.onParticipantUnreadDelta;
  }, [
    args.onRefresh,
    args.onRealtimeMessageInsert,
    args.onRealtimeMessageInsertBatch,
    args.onParticipantUnreadDelta,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fn = () => {
      setRealtimeAuthEpoch((e) => {
        const next = e + 1;
        cmRtLogAuthEpochBump({ epoch: next, source: "token_refresh" });
        return next;
      });
    };
    window.addEventListener(SAMARKET_REALTIME_TOKEN_REFRESH_EVENT, fn);
    return () => window.removeEventListener(SAMARKET_REALTIME_TOKEN_REFRESH_EVENT, fn);
  }, []);

  useEffect(() => {
    if (!args.enabled || !args.userId) return;
    const key = `${args.userId}:${roomIdsFingerprint}`;
    let entry = homeRealtimeEntries.get(key);
    if (!entry || entry.authEpoch !== realtimeAuthEpoch) {
      entry?.stop();
      entry = createHomeRealtimeEntry({
        key,
        userId: args.userId,
        roomIdsFingerprint,
        authEpoch: realtimeAuthEpoch,
      });
      homeRealtimeEntries.set(key, entry);
    }
    entry.listeners.add(listenerRef);
    return () => {
      const current = homeRealtimeEntries.get(key);
      if (!current) return;
      current.listeners.delete(listenerRef);
      if (current.listeners.size === 0) current.stop();
    };
  }, [args.enabled, args.userId, roomIdsFingerprint, realtimeAuthEpoch]);
}

export function useCommunityMessengerRoomRealtime(args: {
  roomId: string | null;
  viewerUserId?: string | null;
  enabled: boolean;
  onRefresh: () => void;
  onMessageEvent?: (event: CommunityMessengerRoomRealtimeMessageEvent) => void;
}) {
  const listenerRef = useRef<RoomRealtimeListener>({
    onRefresh: args.onRefresh,
    onMessageEvent: args.onMessageEvent,
  });
  const [realtimeAuthEpoch, setRealtimeAuthEpoch] = useState(0);

  useEffect(() => {
    listenerRef.current.onRefresh = args.onRefresh;
    listenerRef.current.onMessageEvent = args.onMessageEvent;
  }, [args.onRefresh, args.onMessageEvent]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const fn = () => {
      setRealtimeAuthEpoch((e) => {
        const next = e + 1;
        cmRtLogAuthEpochBump({ epoch: next, source: "token_refresh" });
        return next;
      });
    };
    window.addEventListener(SAMARKET_REALTIME_TOKEN_REFRESH_EVENT, fn);
    return () => window.removeEventListener(SAMARKET_REALTIME_TOKEN_REFRESH_EVENT, fn);
  }, []);

  const viewerForChannel = (args.viewerUserId ?? "").trim() || "anon";

  useEffect(() => {
    if (!args.enabled || !args.roomId) return;
    const rid = args.roomId.trim();
    if (!rid) return;
    const roomKey = rid.toLowerCase();

    let bundle = globalMessengerRoomBundleByViewer.get(viewerForChannel);
    if (!bundle || bundle.authEpoch !== realtimeAuthEpoch) {
      bundle?.stop();
      bundle = createGlobalMessengerRoomBundleEntry({
        viewerForChannel,
        authEpoch: realtimeAuthEpoch,
        onStopped: () => {
          globalMessengerRoomBundleByViewer.delete(viewerForChannel);
        },
      });
      globalMessengerRoomBundleByViewer.set(viewerForChannel, bundle);
    }

    let set = bundle.listenersByRoom.get(roomKey);
    if (!set) {
      set = new Set();
      bundle.listenersByRoom.set(roomKey, set);
    }
    set.add(listenerRef);
    if (bundle.channelSubscribed && set.size === 1) {
      queueMicrotask(() => {
        listenerRef.current.onRefresh();
      });
    }

    return () => {
      const current = globalMessengerRoomBundleByViewer.get(viewerForChannel);
      if (!current) return;
      const s = current.listenersByRoom.get(roomKey);
      if (!s) return;
      s.delete(listenerRef);
      if (s.size === 0) {
        current.listenersByRoom.delete(roomKey);
        disposeGlobalMessengerRoomSchedulers(current, roomKey);
      }
    };
  }, [args.enabled, args.roomId, viewerForChannel, realtimeAuthEpoch]);
}
