"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
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
import {
  bumpMessengerRealtimeLocalUnreadForRoom,
  clearMessengerRealtimeLocalUnreadForRoom,
  getMessengerRealtimeFocusedRoomIdNorm,
} from "@/lib/community-messenger/realtime/messenger-realtime-client-activity-ref";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import {
  publishMessengerHomeRealtimeMapSnapshot,
  recordMessengerHomeRealtimeReactListenerGaugeDelta,
  recordMessengerHomeSupabaseHomeChannelGaugeDelta,
  samarketMessengerHomeDebugEvent,
} from "@/lib/runtime/samarket-runtime-debug";
import { playCoalescedChatNotificationSound } from "@/lib/notifications/coalesced-chat-alert-sound";
import { shouldSuppressMessengerInAppSoundOnTradeExplorationSurface } from "@/lib/notifications/samarket-messenger-notification-regulations";
import { cmReceiveBadgeLog } from "@/lib/community-messenger/read/cm-receive-badge-log";
import { cmRtReadSyncLog } from "@/lib/community-messenger/read/cm-rt-read-sync-log";
import {
  applyIncomingMessageEvent,
  useMessengerRealtimeStore,
} from "@/lib/community-messenger/stores/messenger-realtime-store";
import { cancelScheduledWhenBrowserIdle, scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";
import {
  cmReceiveLatencyKey,
  cmReceiveLatencyMark,
  cmReceiveLatencyNow,
} from "@/lib/community-messenger/monitoring/cm-receive-latency";
import {
  cmRtRoomSubLog,
  messengerRealtimeIsRoomSubscribedForMessages,
  messengerRealtimeGetHomeChannelPhysicalBindCount,
  normalizeCmRealtimeSubscribeRoomId,
} from "@/lib/community-messenger/realtime/cm-rt-room-sub-log";
import { acquireCommunityMessengerReadAckBroadcast } from "@/lib/community-messenger/realtime/cm-read-ack-broadcast-client";
import { cmRtStableSubLog } from "@/lib/community-messenger/realtime/cm-rt-stable-sub-log";
import {
  cmRtHs4DiagnosisLog,
  cmRtHs4FingerprintDigest,
} from "@/lib/community-messenger/realtime/cm-rt-hs4-diagnosis";
import { recordCmRoomEntryMilestone } from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import { MESSENGER_HOME_REALTIME_DEFERRED_PHYSICAL_STOP_GRACE_MS } from "@/lib/community-messenger/messenger-latency-config";
import { logCmRtLifecycleFix } from "@/lib/community-messenger/realtime/cm-rt-lifecycle-fix-log";
import { logCmRtGrace } from "@/lib/community-messenger/realtime/cm-rt-grace-log";

function messengerHomeRealtimeRoomIdsContentKey(ids: string[] | undefined): string {
  return [...new Set((ids ?? []).map((id) => normalizeCmRealtimeSubscribeRoomId(String(id))).filter(Boolean))].sort().join("\0");
}

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
  onParticipantPostgres?: (payload: {
    eventType: string;
    roomId: string;
    newRecord: Record<string, unknown> | null;
    oldRecord: Record<string, unknown> | null;
  }) => void;
};

type HomeRealtimeEntry = {
  listeners: Set<MutableRefObject<HomeRealtimeListener>>;
  insertHintBatchQueue: CommunityMessengerHomeRealtimeMessageInsertHint[];
  insertBatchRafId: number | null;
  stop: () => void;
};

const homeRealtimeMetaEntries = new Map<string, HomeRealtimeEntry>();
const homeRealtimeRoomsEntries = new Map<string, HomeRealtimeEntry>();
const globalMessengerRoomBundleByViewer = new Map<string, GlobalMessengerRoomBundleEntry>();

/** 마지막 리스너 이탈 후 `MESSENGER_HOME_REALTIME_DEFERRED_PHYSICAL_STOP_GRACE_MS` 경과 시 `entry.stop()` */
const homeMetaDeferredPhysicalStopByKey = new Map<string, ReturnType<typeof setTimeout>>();
const homeRoomsDeferredPhysicalStopByKey = new Map<string, ReturnType<typeof setTimeout>>();

function clearMessengerHomeDeferredPhysicalStop(kind: "meta" | "rooms", mapKey: string): boolean {
  const m = kind === "meta" ? homeMetaDeferredPhysicalStopByKey : homeRoomsDeferredPhysicalStopByKey;
  const t = m.get(mapKey);
  if (t == null) return false;
  clearTimeout(t);
  m.delete(mapKey);
  return true;
}

function deferredStopKindForMapKey(mapKey: string): "meta" | "rooms" {
  return mapKey.includes(":rooms:") ? "rooms" : "meta";
}

function clearMessengerHomeDeferredPhysicalStopForAnyKey(mapKey: string): void {
  clearMessengerHomeDeferredPhysicalStop(deferredStopKindForMapKey(mapKey), mapKey);
}

function scheduleMessengerHomeDeferredPhysicalStop(args: {
  kind: "meta" | "rooms";
  mapKey: string;
  channelName: string;
  graceMs: number;
  reason: string;
}): void {
  clearMessengerHomeDeferredPhysicalStop(args.kind, args.mapKey);
  const map = args.kind === "meta" ? homeMetaDeferredPhysicalStopByKey : homeRoomsDeferredPhysicalStopByKey;
  const timer = setTimeout(() => {
    map.delete(args.mapKey);
    const entryMap = args.kind === "meta" ? homeRealtimeMetaEntries : homeRealtimeRoomsEntries;
    const entry = entryMap.get(args.mapKey);
    if (!entry || entry.listeners.size > 0) return;
    const phys = messengerRealtimeGetHomeChannelPhysicalBindCount();
    logCmRtGrace({
      action: "final_stop",
      grace_ms: args.graceMs,
      channelName: args.channelName,
      had_existing_subscription: phys > 0,
      same_fingerprint: null,
    });
    entry.stop();
  }, args.graceMs);
  map.set(args.mapKey, timer);
  const physNow = messengerRealtimeGetHomeChannelPhysicalBindCount();
  logCmRtGrace({
    action: "defer_stop",
    grace_ms: args.graceMs,
    channelName: args.channelName,
    had_existing_subscription: physNow > 0,
    same_fingerprint: null,
  });
}

function pushMessengerHomeRealtimeMapProbe(): void {
  let listenerRefs = 0;
  for (const e of homeRealtimeMetaEntries.values()) {
    listenerRefs += e.listeners.size;
  }
  for (const e of homeRealtimeRoomsEntries.values()) {
    listenerRefs += e.listeners.size;
  }
  publishMessengerHomeRealtimeMapSnapshot(homeRealtimeMetaEntries.size + homeRealtimeRoomsEntries.size, listenerRefs);
}

/** INSERT 힌트 폭주 시 한 프레임 작업량 상한 — 이후 큐는 다음 rAF에서 이어 처리 */
const HOME_REALTIME_MESSAGE_INSERT_FLUSH_MAX_BATCH = 50;
const HOME_REALTIME_ROOM_BUMP_MIN_GAP_MS = 220;
const homeRealtimeRoomBumpLastAt = new Map<string, number>();

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
  const roomNorm = normalizeCmRealtimeSubscribeRoomId(roomRaw);
  const sender = typeof row.sender_id === "string" ? row.sender_id.trim() : "";
  const messageId = typeof row.id === "string" ? row.id.trim() : "";
  const createdAt = typeof row.created_at === "string" ? row.created_at.trim() : "";
  const viewer = args.viewerUserId.trim();
  if (!roomNorm || !viewer) return;

  const routeRoomId =
    typeof window !== "undefined"
      ? window.location.pathname.match(/\/community-messenger\/rooms\/([^/?#]+)/)?.[1]?.trim().toLowerCase() ?? null
      : null;
  const activeRoomId = useMessengerRealtimeStore.getState().activeRoomId;
  const isSelf = Boolean(sender && sender === viewer);
  if (!isSelf && !messengerRealtimeIsRoomSubscribedForMessages(roomNorm)) {
    cmRtRoomSubLog("realtime_message_not_subscribed", {
      roomId: roomRaw,
      messageId: messageId || null,
      senderId: sender || null,
      viewerUserId: viewer,
      note: "hint_received_but_room_not_in_last_subscribed_snapshot",
    });
  }
  cmReceiveBadgeLog("realtime_message_received", {
    roomId: roomRaw,
    messageId: messageId || null,
    senderId: sender || null,
    myUserId: viewer,
    activeRoomId,
    routeRoomId,
    isSelf,
    beforeUnread: null,
    afterUnread: null,
    source: "realtime",
  });
  if (isSelf) {
    cmReceiveBadgeLog("realtime_message_ignored_self", {
      roomId: roomRaw,
      messageId: messageId || null,
      senderId: sender || null,
      myUserId: viewer,
      activeRoomId,
      routeRoomId,
      isSelf: true,
      beforeUnread: null,
      afterUnread: null,
      source: "realtime",
    });
    return;
  }

  const latencyKey = cmReceiveLatencyKey({ roomId: roomRaw, messageId });
  cmReceiveLatencyMark(latencyKey, {
    realtime_event_received_ms: cmReceiveLatencyNow(),
    realtime_payload_room_id: roomRaw,
    realtime_payload_message_id: messageId,
    ...(createdAt ? { db_message_created_at: createdAt } : null),
  });

  cmReceiveLatencyMark(latencyKey, { receiver_store_apply_start_ms: cmReceiveLatencyNow() });
  applyIncomingMessageEvent({
    viewerUserId: viewer,
    roomId: roomRaw,
    messageRow: row,
  });
  cmReceiveLatencyMark(latencyKey, { receiver_store_apply_done_ms: cmReceiveLatencyNow() });
  cmRtReadSyncLog("message_insert_apply_to_list", {
    roomId: roomRaw,
    messageId: messageId || null,
    senderId: sender || null,
    viewerUserId: viewer,
    routeRoomId,
    activeRoomId,
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
  const now = Date.now();
  const last = homeRealtimeRoomBumpLastAt.get(roomNorm) ?? 0;
  if (now - last >= HOME_REALTIME_ROOM_BUMP_MIN_GAP_MS) {
    homeRealtimeRoomBumpLastAt.set(roomNorm, now);
    postCommunityMessengerBusEvent({ type: "cm.room.bump", roomId: roomRaw, at: now });
    requestMessengerHubBadgeResync("participant_unread_changed");
  }

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
  visibleTradeRoomCount?: number;
  includeMeta?: boolean;
  channelBindRole: "home_meta" | "home_rooms_in";
}): HomeRealtimeEntry {
  const sb = getSupabaseClient();
  const entry: HomeRealtimeEntry = {
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
  let releaseReadAckBroadcast: (() => void) | null = null;

  const bindHomeChannels = () => {
    if (cancelled || homeBound) return;
    homeBound = true;
    cmRtHs4DiagnosisLog("home_realtime_auth_bridge_ready_bind", {
      channelBindRole: args.channelBindRole,
      entryStorageKey: args.key,
      ...cmRtHs4FingerprintDigest(args.roomIdsFingerprint),
      includeMeta: args.includeMeta !== false,
      visibleTradeRoomCount: args.visibleTradeRoomCount ?? null,
      physicalBindCountBeforeBind: messengerRealtimeGetHomeChannelPhysicalBindCount(),
    });
    releaseReadAckBroadcast = acquireCommunityMessengerReadAckBroadcast(args.userId);
    const { channels: next, cancelSchedulers: cancel } = bindCommunityMessengerHomeRealtimeChannels({
      sb,
      userId: args.userId,
      isCancelled: () => cancelled,
      roomIdsFingerprint: args.roomIdsFingerprint,
      channelBindRole: args.channelBindRole,
      includeMeta: args.includeMeta,
      visibleTradeRoomCount: args.visibleTradeRoomCount,
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
    recordMessengerHomeSupabaseHomeChannelGaugeDelta(next.length);
  };

  authBridgeCleanup = createRealtimeAuthBridge({
    sb,
    isCancelled: () => cancelled,
    onReady: bindHomeChannels,
  });

  entry.stop = () => {
    clearMessengerHomeDeferredPhysicalStopForAnyKey(args.key);
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
    releaseReadAckBroadcast?.();
    releaseReadAckBroadcast = null;
    const chLen = channels.length;
    if (chLen > 0) {
      recordMessengerHomeSupabaseHomeChannelGaugeDelta(-chLen);
    }
    for (const item of channels) item.stop();
    channels.length = 0;
    homeRealtimeMetaEntries.delete(args.key);
    homeRealtimeRoomsEntries.delete(args.key);
    pushMessengerHomeRealtimeMapProbe();
  };

  return entry;
}

export function useCommunityMessengerHomeRealtime(args: {
  userId: string | null;
  /** 부트스트랩 홈 방 id + URL 라우트 방 — fingerprint 안정 분리용 */
  roomIds?: string[];
  /** 거래·배달 채팅 리스트 visible 행 방 id 만 — `roomIds` 와 합쳐 INSERT 필터 구성 */
  extraRoomIds?: string[];
  /** 홈 목록 부트스트랩 로딩 중 + 아직 room id 가 하나도 없으면 rooms-in 구독 지연(빈 fingerprint 초기 바인드 방지) */
  deferEmptyRoomsWhileBootstrapLoading?: boolean;
  /** `useCommunityMessengerHomeBootstrap` 의 loading 과 동기 — defer 판정용 */
  bootstrapListLoading?: boolean;
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
  const roomIdsContentKey = messengerHomeRealtimeRoomIdsContentKey(args.roomIds);
  const extraRoomIdsContentKey = messengerHomeRealtimeRoomIdsContentKey(args.extraRoomIds);
  const mergedNormalizedRoomIds = useMemo(() => {
    const set = new Set<string>();
    const add = (id: string | null | undefined) => {
      const n = normalizeCmRealtimeSubscribeRoomId(id);
      if (n) set.add(n);
    };
    for (const id of args.roomIds ?? []) add(id);
    for (const id of args.extraRoomIds ?? []) add(id);
    return [...set].sort();
  }, [roomIdsContentKey, extraRoomIdsContentKey]);
  const roomIdsFingerprint = mergedNormalizedRoomIds.join("\0");
  const visibleTradeRoomCountForBind =
    extraRoomIdsContentKey.length > 0 ? extraRoomIdsContentKey.split("\0").filter(Boolean).length : 0;

  /** `visibleTradeRoomCountForBind` 는 HS4/안정 로그용 — postgres 필터는 `roomIdsFingerprint` 만 사용. effect deps 에 넣으면 fingerprint 불변에도 리스너 detach 가 반복된다. */
  const prevRoomsBindFingerprintForLifecycleLogRef = useRef<string | null>(null);

  const deferEmptyWhileLoading = Boolean(args.deferEmptyRoomsWhileBootstrapLoading);
  const bootstrapListLoading = Boolean(args.bootstrapListLoading);

  /** 로딩 중 목록이 잠깐 비었을 때 rooms-in 을 마지막 알려진 집합으로 유지 */
  const lastKnownNonEmptyRoomsFingerprintRef = useRef<string>("");
  const deferringRoomsSubscriptionRef = useRef(false);

  useEffect(() => {
    lastKnownNonEmptyRoomsFingerprintRef.current = "";
    deferringRoomsSubscriptionRef.current = false;
    prevRoomsBindFingerprintForLifecycleLogRef.current = null;
  }, [args.userId]);

  const roomsBindFingerprint = useMemo(() => {
    if (mergedNormalizedRoomIds.length > 0) {
      lastKnownNonEmptyRoomsFingerprintRef.current = roomIdsFingerprint;
      return roomIdsFingerprint;
    }
    if (deferEmptyWhileLoading && bootstrapListLoading) {
      const held = lastKnownNonEmptyRoomsFingerprintRef.current;
      if (!held) return null;
      return held;
    }
    lastKnownNonEmptyRoomsFingerprintRef.current = "";
    return "";
  }, [
    bootstrapListLoading,
    deferEmptyWhileLoading,
    mergedNormalizedRoomIds.length,
    roomIdsFingerprint,
  ]);

  useEffect(() => {
    if (roomsBindFingerprint === null) deferringRoomsSubscriptionRef.current = true;
  }, [roomsBindFingerprint]);

  const prevFingerprintRef = useRef<string | null>(null);
  const prevRoomKeyRef = useRef<string>("");
  const prevExtraKeyRef = useRef<string>("");
  useEffect(() => {
    const prev = prevFingerprintRef.current;
    const rk = roomIdsContentKey;
    const ek = extraRoomIdsContentKey;
    if (prev === null) {
      prevFingerprintRef.current = roomIdsFingerprint;
      prevRoomKeyRef.current = rk;
      prevExtraKeyRef.current = ek;
      return;
    }
    if (prev !== roomIdsFingerprint) {
      const roomChanged = prevRoomKeyRef.current !== rk;
      const extraChanged = prevExtraKeyRef.current !== ek;
      let changedReason: "home_or_route_room_ids" | "visible_trade_room_ids" | "both" = "visible_trade_room_ids";
      if (roomChanged && extraChanged) changedReason = "both";
      else if (roomChanged) changedReason = "home_or_route_room_ids";
      else changedReason = "visible_trade_room_ids";
      prevRoomKeyRef.current = rk;
      prevExtraKeyRef.current = ek;
      prevFingerprintRef.current = roomIdsFingerprint;

      const suppressBootstrapFillNoise =
        deferringRoomsSubscriptionRef.current && prev === "" && roomIdsFingerprint.length > 0;
      if (suppressBootstrapFillNoise) deferringRoomsSubscriptionRef.current = false;

      if (!suppressBootstrapFillNoise) {
        cmRtStableSubLog("fingerprint_changed", {
          viewerUserId: args.userId,
          prevFingerprintLength: prev.length,
          nextFingerprintLength: roomIdsFingerprint.length,
          changedReason,
          rebindCount: messengerRealtimeGetHomeChannelPhysicalBindCount(),
          visible_trade_room_count: ek.length ? ek.split("\0").filter(Boolean).length : 0,
        });
        cmRtHs4DiagnosisLog("home_room_fingerprint_changed", {
          viewerUserIdTail: args.userId && args.userId.length > 8 ? args.userId.slice(-8) : args.userId,
          changedReason,
          prevFp: cmRtHs4FingerprintDigest(prev),
          nextFp: cmRtHs4FingerprintDigest(roomIdsFingerprint),
          suppressBootstrapFillNoise: false,
        });
      }
    }
  }, [roomIdsFingerprint, roomIdsContentKey, extraRoomIdsContentKey, args.userId]);

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
    if (!args.enabled || !args.userId) return;
    const graceMs = MESSENGER_HOME_REALTIME_DEFERRED_PHYSICAL_STOP_GRACE_MS;
    const metaKey = `${args.userId}:meta`;

    const hadDeferredMeta = clearMessengerHomeDeferredPhysicalStop("meta", metaKey);
    if (hadDeferredMeta) {
      logCmRtGrace({
        action: "cancel_stop",
        grace_ms: graceMs,
        channelName: `community-messenger-home:meta:${args.userId}`,
        had_existing_subscription: messengerRealtimeGetHomeChannelPhysicalBindCount() > 0,
        same_fingerprint: null,
      });
    }

    const bindFp = roomsBindFingerprint;
    const roomsKey = bindFp !== null ? `${args.userId}:rooms:${bindFp}` : null;

    let hadDeferredRooms = false;
    if (roomsKey) {
      hadDeferredRooms = clearMessengerHomeDeferredPhysicalStop("rooms", roomsKey);
      if (hadDeferredRooms) {
        logCmRtGrace({
          action: "cancel_stop",
          grace_ms: graceMs,
          channelName: `community-messenger-home:rooms-in:${args.userId}`,
          had_existing_subscription: messengerRealtimeGetHomeChannelPhysicalBindCount() > 0,
          same_fingerprint:
            bindFp !== null &&
            prevRoomsBindFingerprintForLifecycleLogRef.current !== null &&
            prevRoomsBindFingerprintForLifecycleLogRef.current === bindFp,
        });
      }
    }

    const sameRoomsFingerprint =
      bindFp !== null &&
      prevRoomsBindFingerprintForLifecycleLogRef.current !== null &&
      prevRoomsBindFingerprintForLifecycleLogRef.current === bindFp;
    if (bindFp !== null) {
      prevRoomsBindFingerprintForLifecycleLogRef.current = bindFp;
    }

    let metaEntry = homeRealtimeMetaEntries.get(metaKey);
    const metaCreated = !metaEntry;
    if (!metaEntry) {
      metaEntry = createHomeRealtimeEntry({
        key: metaKey,
        userId: args.userId,
        roomIdsFingerprint: "",
        includeMeta: true,
        channelBindRole: "home_meta",
      });
      homeRealtimeMetaEntries.set(metaKey, metaEntry);
    }

    let roomsEntry: HomeRealtimeEntry | null = null;
    let roomsCreated = false;
    if (bindFp !== null && roomsKey) {
      roomsEntry = homeRealtimeRoomsEntries.get(roomsKey) ?? null;
      roomsCreated = !roomsEntry;
      if (!roomsEntry) {
        roomsEntry = createHomeRealtimeEntry({
          key: roomsKey,
          userId: args.userId,
          roomIdsFingerprint: bindFp,
          visibleTradeRoomCount: visibleTradeRoomCountForBind,
          includeMeta: false,
          channelBindRole: "home_rooms_in",
        });
        homeRealtimeRoomsEntries.set(roomsKey, roomsEntry);
      }
    }

    const roomsHadPeersBefore = roomsEntry != null && roomsEntry.listeners.size > 0;
    const metaHadPeers = metaEntry.listeners.size > 0;
    samarketMessengerHomeDebugEvent("messenger_home_subscribe_create", {
      key: roomsKey ?? `${args.userId}:rooms:(deferred)`,
      metaKey,
      roomsKey: roomsKey ?? `${args.userId}:rooms:(deferred)`,
      rooms_bind_deferred: bindFp === null,
    });
    metaEntry.listeners.add(listenerRef);
    if (roomsEntry) roomsEntry.listeners.add(listenerRef);
    const physAfter = messengerRealtimeGetHomeChannelPhysicalBindCount();
    if (metaCreated) {
      logCmRtLifecycleFix({
        action: "create",
        channelName: `community-messenger-home:meta:${args.userId}`,
        reason: "first_meta_entry",
        had_existing_subscription: physAfter > 0,
        active_count: physAfter,
        listener_count: metaEntry.listeners.size,
      });
    } else {
      logCmRtLifecycleFix({
        action: "reuse",
        channelName: `community-messenger-home:meta:${args.userId}`,
        reason: metaHadPeers ? "additional_listener" : "rejoin_within_grace_or_same_route",
        had_existing_subscription: physAfter > 0,
        active_count: physAfter,
        listener_count: metaEntry.listeners.size,
      });
      if (!metaHadPeers) {
        logCmRtGrace({
          action: "reuse_existing",
          grace_ms: graceMs,
          channelName: `community-messenger-home:meta:${args.userId}`,
          had_existing_subscription: physAfter > 0,
          same_fingerprint: null,
        });
      }
    }

    if (roomsKey && roomsEntry) {
      if (roomsCreated) {
        logCmRtLifecycleFix({
          action: "create",
          channelName: `community-messenger-home:rooms-in:${args.userId}`,
          reason: "first_rooms_entry_for_fingerprint",
          same_fingerprint: sameRoomsFingerprint,
          had_existing_subscription: physAfter > 0,
          active_count: physAfter,
          listener_count: roomsEntry.listeners.size,
        });
      } else {
        logCmRtLifecycleFix({
          action: "reuse",
          channelName: `community-messenger-home:rooms-in:${args.userId}`,
          reason: roomsHadPeersBefore ? "additional_listener" : "rejoin_within_grace_or_same_route",
          same_fingerprint: sameRoomsFingerprint,
          had_existing_subscription: physAfter > 0,
          active_count: physAfter,
          listener_count: roomsEntry.listeners.size,
        });
        if (!roomsHadPeersBefore) {
          logCmRtGrace({
            action: "reuse_existing",
            grace_ms: graceMs,
            channelName: `community-messenger-home:rooms-in:${args.userId}`,
            same_fingerprint: sameRoomsFingerprint,
            had_existing_subscription: physAfter > 0,
          });
        }
      }
    }

    recordMessengerHomeRealtimeReactListenerGaugeDelta(1);
    pushMessengerHomeRealtimeMapProbe();
    return () => {
      samarketMessengerHomeDebugEvent("messenger_home_subscribe_cleanup", {
        key: roomsKey ?? `${args.userId}:rooms:(deferred)`,
        metaKey,
        roomsKey: roomsKey ?? `${args.userId}:rooms:(deferred)`,
      });
      const currentMeta = homeRealtimeMetaEntries.get(metaKey);
      if (currentMeta) {
        currentMeta.listeners.delete(listenerRef);
        if (currentMeta.listeners.size === 0) {
          scheduleMessengerHomeDeferredPhysicalStop({
            kind: "meta",
            mapKey: metaKey,
            channelName: `community-messenger-home:meta:${args.userId}`,
            graceMs,
            reason: "last_home_realtime_listener_removed",
          });
        }
      }

      if (roomsKey) {
        const currentRooms = homeRealtimeRoomsEntries.get(roomsKey);
        if (currentRooms) {
          currentRooms.listeners.delete(listenerRef);
          if (currentRooms.listeners.size === 0) {
            scheduleMessengerHomeDeferredPhysicalStop({
              kind: "rooms",
              mapKey: roomsKey,
              channelName: `community-messenger-home:rooms-in:${args.userId}`,
              graceMs,
              reason: "last_home_realtime_listener_removed",
            });
          }
        }
      }
      recordMessengerHomeRealtimeReactListenerGaugeDelta(-1);
      pushMessengerHomeRealtimeMapProbe();
    };
    /** `visibleTradeRoomCountForBind` 는 deps 에서 제외(위 주석). */
  }, [args.enabled, args.userId, roomsBindFingerprint]);
}

export function useCommunityMessengerRoomRealtime(args: {
  roomId: string | null;
  viewerUserId?: string | null;
  enabled: boolean;
  onRefresh: () => void;
  onMessageEvent?: (event: CommunityMessengerRoomRealtimeMessageEvent) => void;
  onParticipantPostgres?: RoomRealtimeListener["onParticipantPostgres"];
}) {
  const listenerRef = useRef<RoomRealtimeListener>({
    onRefresh: args.onRefresh,
    onMessageEvent: args.onMessageEvent,
    onParticipantPostgres: args.onParticipantPostgres,
  });
  useEffect(() => {
    listenerRef.current.onRefresh = args.onRefresh;
    listenerRef.current.onMessageEvent = args.onMessageEvent;
    listenerRef.current.onParticipantPostgres = args.onParticipantPostgres;
  }, [args.onRefresh, args.onMessageEvent, args.onParticipantPostgres]);

  const viewerForChannel = (args.viewerUserId ?? "").trim() || "anon";

  useEffect(() => {
    if (!args.enabled || !args.roomId) return;
    const rid = args.roomId.trim();
    if (!rid) return;
    const roomKey = rid.toLowerCase();

    let bundle = globalMessengerRoomBundleByViewer.get(viewerForChannel);
    if (!bundle) {
      bundle = createGlobalMessengerRoomBundleEntry({
        viewerForChannel,
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
    recordCmRoomEntryMilestone("realtime_ready_ms");
    bundle.notifyRoomListenersChanged?.();
    let idleOnFirstRoomListener = -1;
    if (bundle.channelSubscribed && set.size === 1) {
      idleOnFirstRoomListener = scheduleWhenBrowserIdle(() => {
        listenerRef.current.onRefresh();
      }, 800);
    }

    return () => {
      if (idleOnFirstRoomListener >= 0) {
        cancelScheduledWhenBrowserIdle(idleOnFirstRoomListener);
      }
      const current = globalMessengerRoomBundleByViewer.get(viewerForChannel);
      if (!current) return;
      const s = current.listenersByRoom.get(roomKey);
      if (!s) return;
      s.delete(listenerRef);
      if (s.size === 0) {
        current.listenersByRoom.delete(roomKey);
        disposeGlobalMessengerRoomSchedulers(current, roomKey);
      }
      current.notifyRoomListenersChanged?.();
    };
  }, [args.enabled, args.roomId, viewerForChannel]);
}
