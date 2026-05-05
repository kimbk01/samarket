"use client";

import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import {
  buildCommunityMessengerMarkReadPatchBody,
  communityMessengerMarkReadFetchInitBase,
  parseCommunityMessengerMarkReadResponse,
} from "@/lib/community-messenger/room/community-messenger-mark-read-fetch";
import {
  CM_MARK_READ_SCROLL_DEBOUNCE_MS,
  CM_MARK_READ_VIEWPORT_BOTTOM_GAP_PX,
  CM_READ_LATEST_MESSAGE_MIN_VISIBLE_RATIO,
} from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { dispatchTradeChatUnreadUpdated } from "@/lib/chats/chat-channel-events";
import { isMessengerRoomReadGateExtraBlocked } from "@/lib/community-messenger/room/messenger-room-read-gate";
import { messengerMonitorUnreadListSync } from "@/lib/community-messenger/monitoring/client";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import {
  cmReadBadgeLog,
  refreshLocalReadGuardServerAck,
  setLocalReadGuard,
} from "@/lib/community-messenger/read/local-read-guard";
import { applyCmReadUiBadgeZero } from "@/lib/community-messenger/read/cm-read-ui-patch";
import { cmRtReadSyncLog } from "@/lib/community-messenger/read/cm-rt-read-sync-log";
import {
  applyRoomReadEvent,
  applyRoomSummaryPatched,
} from "@/lib/community-messenger/stores/messenger-realtime-store";
import { recordRouteEntryElapsedMetric, recordRouteEntryMetric } from "@/lib/runtime/samarket-runtime-debug";
import type {
  CommunityMessengerMessage,
  CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";

export type MessengerRoomOpenMarkReadPhaseRef = MutableRefObject<{
  roomId: string | null;
  phase: "idle" | "in_flight" | "done";
  /** `mark_read` PATCH 성공 시점의 `lastReadMessageId` — 동일 방·unread 0 인데 상대 신규 메시지가 오면 다시 idle 로 풀어 읽음 커서를 진행한다 */
  lastMarkedMessageId?: string | null;
}>;

function lastMarkableMessageId(
  roomMessages: Array<CommunityMessengerMessage & { pending?: boolean }>,
  snapshotMessages: CommunityMessengerMessage[] | undefined
): string | null {
  const list = roomMessages.length > 0 ? roomMessages : snapshotMessages ?? [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const m = list[i] as CommunityMessengerMessage & { pending?: boolean };
    if (m.pending) continue;
    const mid = String(m.id ?? "").trim();
    if (mid) return mid;
  }
  return null;
}

function isLatestMessageVisibleEnoughInViewport(root: HTMLElement | null, messageId: string | null): boolean {
  if (!root || !messageId) return false;
  const el = document.getElementById(`cm-room-msg-${messageId}`);
  if (!el) return false;
  const rootRect = root.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const h = Math.max(1, elRect.height);
  const overlap = Math.max(0, Math.min(rootRect.bottom, elRect.bottom) - Math.max(rootRect.top, elRect.top));
  return overlap / h >= CM_READ_LATEST_MESSAGE_MIN_VISIBLE_RATIO;
}

function isMessagesViewportShowingThreadTail(root: HTMLElement | null, bottomGapPx: number): boolean {
  if (!root) return false;
  const gap = root.scrollHeight - root.scrollTop - root.clientHeight;
  if (!Number.isFinite(gap)) return false;
  if (root.scrollHeight <= root.clientHeight + 6) return true;
  return gap <= bottomGapPx;
}

export const ROOM_OPEN_ALIGN_TRACE =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE_ROOM_OPEN_ALIGN === "1";

export type RoomOpenAlignTraceExtra = {
  phase?: string;
  store_updates_count?: number;
  bus_events_count?: number;
  /** 구독 범위 힌트 (정확한 리렌더 카운트는 프로덕션 미삽입) */
  rerender_hint?: string;
};

/** RPC·레거시 폴백이 1.5s 를 넘기면 Abort 로 실패하던 케이스 완화 */
const CM_MARK_READ_SERVER_TIMEOUT_MS = 12_000;

type RoomReadAckReason =
  | "initial-render"
  | "near-bottom"
  | "incoming-visible"
  | "visibility-return"
  | "focus-return"
  | "resize"
  | "mutation";

type RoomReadableState = {
  readable: boolean;
  visible: boolean;
  focused: boolean;
  routeMatches: boolean;
  rendered: boolean;
  blocked: boolean;
};

type LastVisibleUnreadMessage = {
  id: string | null;
  visible: boolean;
  domExists: boolean;
};

export function traceRoomOpenAlignChain(
  source: string,
  roomId: string,
  syncMs: number,
  tAnchor: number,
  extra?: RoomOpenAlignTraceExtra
): void {
  if (!ROOM_OPEN_ALIGN_TRACE || typeof performance === "undefined") return;
  queueMicrotask(() => {
    const afterMicrotask = Math.round(performance.now() - tAnchor);
    requestAnimationFrame(() => {
      const afterFrame1 = Math.round(performance.now() - tAnchor);
      requestAnimationFrame(() => {
        const afterFrame2 = Math.round(performance.now() - tAnchor);
        // eslint-disable-next-line no-console
        console.info("[room_open_align:after]", {
          phase: extra?.phase ?? source,
          source,
          roomIdSuffix: roomId.slice(-8),
          sync_ms: Math.round(syncMs),
          to_microtask_ms: afterMicrotask,
          to_frame1_ms: afterFrame1,
          to_frame2_ms: afterFrame2,
          store_updates_count: extra?.store_updates_count,
          bus_events_count: extra?.bus_events_count,
          rerender_hint: extra?.rerender_hint,
        });
      });
    });
  });
}

function currentRouteMatchesRoom(roomId: string, snapshotRoomId: string | null): boolean {
  if (typeof window === "undefined") return true;
  const pathname = window.location.pathname;
  const match = pathname.match(/^\/community-messenger\/rooms\/([^/]+)\/?$/);
  if (!match?.[1]) return false;
  let routeRoomId = match[1];
  try {
    routeRoomId = decodeURIComponent(routeRoomId);
  } catch {
    /* keep raw path segment */
  }
  return routeRoomId === roomId || (snapshotRoomId != null && routeRoomId === snapshotRoomId);
}

function documentIsVisible(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible";
}

function windowIsFocused(): boolean {
  if (typeof document === "undefined" || typeof document.hasFocus !== "function") return true;
  return document.hasFocus();
}

function isRoomActuallyReadableState(args: {
  roomId: string;
  snapshot: CommunityMessengerRoomSnapshot | null;
  roomMessages: Array<CommunityMessengerMessage & { pending?: boolean }>;
  roomLoading: boolean;
  overlayBlocked: boolean;
}): RoomReadableState {
  const snapshotRoomId = args.snapshot?.room.id?.trim() || null;
  const visible = documentIsVisible();
  const focused = windowIsFocused();
  const routeMatches = currentRouteMatchesRoom(args.roomId, snapshotRoomId);
  const rendered = args.roomMessages.length > 0 || Boolean(args.snapshot?.messages?.length);
  const blocked = args.roomLoading || args.overlayBlocked || isMessengerRoomReadGateExtraBlocked();
  /** 분할 창 등: 탭은 보이나 `document.hasFocus()` 가 false 인 경우에도 읽음 커서 진행 허용 */
  const readable =
    Boolean(args.snapshot) && visible && routeMatches && rendered && !blocked;
  return {
    readable,
    visible,
    focused,
    routeMatches,
    rendered,
    blocked,
  };
}

function isNearBottom(root: HTMLElement | null): boolean {
  return isMessagesViewportShowingThreadTail(root, CM_MARK_READ_VIEWPORT_BOTTOM_GAP_PX);
}

function getLastVisibleUnreadMessage(root: HTMLElement | null, messageId: string | null): LastVisibleUnreadMessage {
  if (!root || !messageId || typeof document === "undefined") {
    return { id: messageId, visible: false, domExists: false };
  }
  const el = document.getElementById(`cm-room-msg-${messageId}`);
  if (!el) return { id: messageId, visible: false, domExists: false };
  return {
    id: messageId,
    visible: isLatestMessageVisibleEnoughInViewport(root, messageId),
    domExists: true,
  };
}

function debugRoomReadAck(payload: {
  roomId: string;
  reason: RoomReadAckReason | "blur" | "visibility-hidden" | "rollback";
  visible: boolean;
  focused: boolean;
  rendered: boolean;
  hasDom: boolean;
  nearBottom: boolean;
  lastVisibleMessageId: string | null;
  previousReadCursor: string | null;
  nextReadCursor: string | null;
  debounceMs: number;
  optimisticApplied: boolean;
  /** 리스트 배지 낙관적 제거(스토어·bus 적용)까지 걸린 ms — 서버 PATCH 와 무관 */
  optimistic_clear_ms?: number;
  serverOk?: boolean;
  elapsedMs?: number;
}): void {
  if (process.env.NODE_ENV === "production") return;
  // eslint-disable-next-line no-console
  console.info("[cm-read-ack]", payload);
}

/**
 * 실제로 읽을 수 있는 상태(가시 탭 + window focus + 메시지 DOM + 하단/viewport)에서만 read cursor를 진행한다.
 */
export function useMessengerRoomOpenMarkReadEffect(args: {
  roomId: string;
  snapshotRef: RefObject<CommunityMessengerRoomSnapshot | null>;
  roomOpenMarkReadRef: MessengerRoomOpenMarkReadPhaseRef;
  stickToBottomRef: MutableRefObject<boolean>;
  roomMessagesRef: MutableRefObject<Array<CommunityMessengerMessage & { pending?: boolean }>>;
  messagesViewportRef: RefObject<HTMLElement | null>;
  /** 시트·메시지 액션·통화 스텁 시트 등 Phase1 오버레이 */
  readPhase1OverlayBlockedRef: MutableRefObject<boolean>;
  /** 초기 부트스트랩 등으로 타임라인 미준비 시 true */
  roomLoadingRef: MutableRefObject<boolean>;
  /** unread / latest message / overlay / loading 변화 시 재평가 트리거 */
  readGateVersion: string;
  /**
   * 상대 INSERT 직후 설정 — 하단 고정인데 말풍선 DOM 비율만 미달일 때 읽음 후보를 한 번 풀어준다.
   */
  peerTailMarkReadHintRef?: MutableRefObject<string | null>;
}): void {
  const {
    roomId,
    snapshotRef,
    roomOpenMarkReadRef,
    stickToBottomRef,
    roomMessagesRef,
    messagesViewportRef,
    readPhase1OverlayBlockedRef,
    roomLoadingRef,
    readGateVersion,
    peerTailMarkReadHintRef,
  } = args;

  const readMarkReadyRecordedRoomRef = useRef<string | null>(null);
  const unreadReadSyncRecordedRoomRef = useRef<string | null>(null);
  const readMarkEffectStartRecordedRoomRef = useRef<string | null>(null);
  const readMarkEffectEndRecordedRoomRef = useRef<string | null>(null);
  const readMarkEffectCountRef = useRef(0);
  const lastSeenReadGateMessageIdRef = useRef<string | null>(null);
  /** 동일 lastReadMessageId 에 대해 리스트 낙관적 0 중복 적용 방지 */
  const earlyOptimisticMessageIdRef = useRef<string | null>(null);
  /** 낙관적 제거 직전 스냅샷 unread — 스크롤 업·blur 등으로 PATCH 전 조건 이탈 시 복원 */
  const preOptimisticUnreadRef = useRef<number | null>(null);

  useEffect(() => {
    const id = roomId?.trim();
    if (!id) return;
    readMarkEffectCountRef.current += 1;
    recordRouteEntryMetric("messenger_room_entry", "read_mark_effect_count", readMarkEffectCountRef.current);
    if (readMarkReadyRecordedRoomRef.current !== id) readMarkReadyRecordedRoomRef.current = null;
    if (unreadReadSyncRecordedRoomRef.current !== id) unreadReadSyncRecordedRoomRef.current = null;
    if (readMarkEffectStartRecordedRoomRef.current !== id) {
      readMarkEffectStartRecordedRoomRef.current = id;
      recordRouteEntryElapsedMetric("messenger_room_entry", "read_mark_effect_start_ms");
    }
    if (readMarkEffectEndRecordedRoomRef.current !== id) {
      readMarkEffectEndRecordedRoomRef.current = null;
    }

    if (roomOpenMarkReadRef.current.roomId !== id) {
      roomOpenMarkReadRef.current = { roomId: id, phase: "idle" };
      lastSeenReadGateMessageIdRef.current = null;
      earlyOptimisticMessageIdRef.current = null;
      preOptimisticUnreadRef.current = null;
    }

    let cancelled = false;
    let readAckDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let readAckRafId: number | null = null;
    let immediateOpenFlushDoneThisMount = false;

    const clearScheduledReadAck = () => {
      if (readAckDebounceTimer != null) {
        clearTimeout(readAckDebounceTimer);
        readAckDebounceTimer = null;
      }
      if (readAckRafId != null) {
        cancelAnimationFrame(readAckRafId);
        readAckRafId = null;
      }
    };

    const applyOptimisticRoomRead = (snap: CommunityMessengerRoomSnapshot, lastReadMessageId: string | null) => {
      const tAlign0 = typeof performance !== "undefined" ? performance.now() : Date.now();
      applyRoomReadEvent({
        viewerUserId: snap.viewerUserId,
        roomId: id,
        lastReadMessageId,
      });
      postCommunityMessengerBusEvent({
        type: "cm.room.read",
        roomId: id,
        viewerUserId: snap.viewerUserId,
        ...(lastReadMessageId ? { lastReadMessageId } : {}),
        at: Date.now(),
      });
      cmReadBadgeLog("read_bus_emit", { roomId: id, lastReadMessageId: lastReadMessageId ?? null });
      postCommunityMessengerBusEvent({
        type: "cm.room.local_unread",
        roomId: id,
        viewerUserId: snap.viewerUserId,
        unreadCount: 0,
        at: Date.now(),
      });
      applyCmReadUiBadgeZero({
        roomId: id,
        viewerUserId: snap.viewerUserId,
        phase: "optimistic",
        reason: "applyOptimisticRoomRead",
      });
      return typeof performance !== "undefined" ? Math.round(performance.now() - tAlign0) : 0;
    };

    const runImmediateOpenFlushOnce = () => {
      if (cancelled || immediateOpenFlushDoneThisMount) return;
      const snap = snapshotRef.current;
      const viewer = snap?.viewerUserId?.trim();
      if (!snap || String(snap.room.id) !== String(id) || !viewer) return;
      immediateOpenFlushDoneThisMount = true;
      const refLm = String(snap.room.lastMessageAt ?? "");
      setLocalReadGuard({ roomId: id, referenceLastMessageAt: refLm, source: "room_enter" });
      const tailId = lastMarkableMessageId(roomMessagesRef.current, snap.messages);
      cmReadBadgeLog("room_enter_optimistic_zero", { roomId: id, hasTail: Boolean(tailId) });
      const alignMs = applyOptimisticRoomRead(snap, tailId);
      if (typeof performance !== "undefined") {
        messengerMonitorUnreadListSync(id, alignMs, "mark_read");
        if (unreadReadSyncRecordedRoomRef.current !== id) {
          unreadReadSyncRecordedRoomRef.current = id;
          recordRouteEntryMetric("messenger_room_entry", "unread_read_sync_ms", alignMs);
        }
      }
      cmReadBadgeLog("mark_read_patch_start", { roomId: id, flushOpen: true, path: "immediate_open" });
      void (async () => {
        const ac = new AbortController();
        const timeout = setTimeout(() => ac.abort(), CM_MARK_READ_SERVER_TIMEOUT_MS);
        try {
          const res = await fetch(communityMessengerRoomResourcePath(id), {
            ...communityMessengerMarkReadFetchInitBase,
            signal: ac.signal,
            body: JSON.stringify(buildCommunityMessengerMarkReadPatchBody()),
          });
          const parsed = await parseCommunityMessengerMarkReadResponse(res);
          if (parsed.okHttp && parsed.json.ok === true) {
            refreshLocalReadGuardServerAck(id);
            const snapViewer = snapshotRef.current?.viewerUserId?.trim();
            if (snapViewer) {
              applyCmReadUiBadgeZero({
                roomId: id,
                viewerUserId: snapViewer,
                phase: "patch_done",
                reason: "immediate_open_patch",
              });
            }
            cmReadBadgeLog("mark_read_patch_done", { roomId: id, path: "immediate_open" });
          } else {
            cmReadBadgeLog("mark_read_patch_fail", {
              roomId: id,
              path: "immediate_open",
              status: parsed.status,
              networkError: false,
              okHttp: parsed.okHttp,
              jsonOk: parsed.json.ok,
              apiError: parsed.json.error ?? null,
              responseBody: parsed.rawPreview,
            });
          }
        } catch (err) {
          cmReadBadgeLog("mark_read_patch_fail", {
            roomId: id,
            path: "immediate_open",
            networkError: true,
            error: err instanceof Error ? err.message : String(err),
          });
        } finally {
          clearTimeout(timeout);
        }
      })();
    };

    const reconcileUnreadFromServer = () => {
      if (typeof queueMicrotask === "function") {
        queueMicrotask(() => requestMessengerHubBadgeResync("room_phase2_mark_read"));
      } else {
        requestMessengerHubBadgeResync("room_phase2_mark_read");
      }
    };

    const tryEarlyOptimisticListBadgeClear = (
      reason: RoomReadAckReason,
      candidate: string,
      readableSnapshot: CommunityMessengerRoomSnapshot
    ) => {
      if (earlyOptimisticMessageIdRef.current === candidate) return;
      if (preOptimisticUnreadRef.current === null) {
        const u = readableSnapshot.room.unreadCount;
        preOptimisticUnreadRef.current = typeof u === "number" && Number.isFinite(u) ? Math.max(0, Math.floor(u)) : null;
      }
      const alignMs = applyOptimisticRoomRead(readableSnapshot, candidate);
      earlyOptimisticMessageIdRef.current = candidate;
      if (typeof performance !== "undefined") {
        messengerMonitorUnreadListSync(id, alignMs, "mark_read");
        if (unreadReadSyncRecordedRoomRef.current !== id) {
          unreadReadSyncRecordedRoomRef.current = id;
          recordRouteEntryMetric("messenger_room_entry", "unread_read_sync_ms", alignMs);
        }
      }
      const vp = messagesViewportRef.current;
      const lastId = lastMarkableMessageId(roomMessagesRef.current, readableSnapshot.messages);
      const lastVis = getLastVisibleUnreadMessage(vp, lastId);
      debugRoomReadAck({
        roomId: id,
        reason,
        visible: documentIsVisible(),
        focused: windowIsFocused(),
        rendered: true,
        hasDom: lastVis.domExists,
        nearBottom: isNearBottom(vp),
        lastVisibleMessageId: lastVis.visible ? lastVis.id : null,
        previousReadCursor: roomOpenMarkReadRef.current.lastMarkedMessageId ?? null,
        nextReadCursor: candidate,
        debounceMs: CM_MARK_READ_SCROLL_DEBOUNCE_MS,
        optimisticApplied: true,
        optimistic_clear_ms: alignMs,
      });
    };

    const maybeRollbackEarlyOptimisticBadge = (
      reason: RoomReadAckReason | "blur" | "visibility-hidden" | "rollback"
    ) => {
      if (!earlyOptimisticMessageIdRef.current) return;
      if (roomOpenMarkReadRef.current.phase !== "idle") return;
      const snap = snapshotRef.current;
      const restoreUnread = preOptimisticUnreadRef.current;
      earlyOptimisticMessageIdRef.current = null;
      preOptimisticUnreadRef.current = null;
      if (!snap || String(snap.room.id) !== String(id) || restoreUnread == null || restoreUnread < 1) {
        reconcileUnreadFromServer();
        return;
      }
      applyRoomSummaryPatched({
        viewerUserId: snap.viewerUserId,
        roomId: id,
        unreadCount: restoreUnread,
      });
      postCommunityMessengerBusEvent({
        type: "cm.room.local_unread",
        roomId: id,
        viewerUserId: snap.viewerUserId,
        unreadCount: restoreUnread,
        at: Date.now(),
      });
      if (snap.room.contextMeta?.kind === "trade") {
        dispatchTradeChatUnreadUpdated({
          source: "community-messenger-room-read-rollback",
          key: snap.room.contextMeta.postId ?? id,
          dedupeMs: 0,
        });
      }
      debugRoomReadAck({
        roomId: id,
        reason,
        visible: documentIsVisible(),
        focused: windowIsFocused(),
        rendered: true,
        hasDom: (() => {
          const lid = lastMarkableMessageId(roomMessagesRef.current, snap.messages);
          return lid ? Boolean(document.getElementById(`cm-room-msg-${lid}`)) : false;
        })(),
        nearBottom: isNearBottom(messagesViewportRef.current),
        lastVisibleMessageId: null,
        previousReadCursor: roomOpenMarkReadRef.current.lastMarkedMessageId ?? null,
        nextReadCursor: null,
        debounceMs: CM_MARK_READ_SCROLL_DEBOUNCE_MS,
        optimisticApplied: false,
      });
    };

    const flushRoomReadAck = (reason: RoomReadAckReason, lastReadMessageId: string) => {
      const snap = snapshotRef.current;
      if (!snap || String(snap.room.id) !== String(id)) return;
      if (roomOpenMarkReadRef.current.phase !== "idle") return;
      if (!lastReadMessageId || roomOpenMarkReadRef.current.lastMarkedMessageId === lastReadMessageId) return;

      const optimisticAlreadyApplied = earlyOptimisticMessageIdRef.current === lastReadMessageId;

      roomOpenMarkReadRef.current.phase = "in_flight";
      const tAnchor = typeof performance !== "undefined" ? performance.now() : Date.now();
      const previousReadCursor = roomOpenMarkReadRef.current.lastMarkedMessageId ?? null;
      let alignMs = 0;
      if (!optimisticAlreadyApplied) {
        alignMs = applyOptimisticRoomRead(snap, lastReadMessageId);
        if (ROOM_OPEN_ALIGN_TRACE) {
          traceRoomOpenAlignChain("patchMarkRead_sync", id, alignMs, tAnchor, {
            phase: "patchMarkRead_sync",
            store_updates_count: 1,
            bus_events_count: 2,
            rerender_hint: "messenger_store+hub_snapshot_tab(chat)+home_list_if_open",
          });
        }

        if (typeof performance !== "undefined") {
          messengerMonitorUnreadListSync(id, alignMs, "mark_read");
          if (unreadReadSyncRecordedRoomRef.current !== id) {
            unreadReadSyncRecordedRoomRef.current = id;
            recordRouteEntryMetric("messenger_room_entry", "unread_read_sync_ms", alignMs);
          }
        }
      }

      debugRoomReadAck({
        roomId: id,
        reason,
        visible: documentIsVisible(),
        focused: windowIsFocused(),
        rendered: true,
        hasDom: true,
        nearBottom: isNearBottom(messagesViewportRef.current),
        lastVisibleMessageId: lastReadMessageId,
        previousReadCursor,
        nextReadCursor: lastReadMessageId,
        debounceMs: CM_MARK_READ_SCROLL_DEBOUNCE_MS,
        optimisticApplied: true,
        optimistic_clear_ms: optimisticAlreadyApplied ? undefined : alignMs,
      });

      cmReadBadgeLog("mark_read_patch_start", { roomId: id, path: "scroll_ack", lastReadMessageId });
      void (async () => {
        const ac = new AbortController();
        const timeout = setTimeout(() => ac.abort(), CM_MARK_READ_SERVER_TIMEOUT_MS);
        try {
          const res = await fetch(communityMessengerRoomResourcePath(id), {
            ...communityMessengerMarkReadFetchInitBase,
            signal: ac.signal,
            body: JSON.stringify(buildCommunityMessengerMarkReadPatchBody(lastReadMessageId)),
          });
          const parsed = await parseCommunityMessengerMarkReadResponse(res);
          const json = parsed.json;
          const serverLastId =
            typeof json.lastReadMessageId === "string" && json.lastReadMessageId.trim()
              ? json.lastReadMessageId.trim()
              : lastReadMessageId;

          if (parsed.okHttp && json.ok === true) {
            refreshLocalReadGuardServerAck(id);
            const sv = snapshotRef.current?.viewerUserId?.trim();
            if (sv) {
              applyCmReadUiBadgeZero({
                roomId: id,
                viewerUserId: sv,
                phase: "patch_done",
                reason: "scroll_ack_patch",
              });
            }
            cmReadBadgeLog("mark_read_patch_done", { roomId: id, path: "scroll_ack" });
            if (peerTailMarkReadHintRef?.current && peerTailMarkReadHintRef.current === lastReadMessageId) {
              peerTailMarkReadHintRef.current = null;
            }
            earlyOptimisticMessageIdRef.current = null;
            preOptimisticUnreadRef.current = null;
            roomOpenMarkReadRef.current = {
              roomId: id,
              phase: "done",
              lastMarkedMessageId: serverLastId ?? null,
            };
            const snapAfter = snapshotRef.current;
            if (snapAfter && String(snapAfter.room.id) === String(id)) {
              if (snapAfter.room.contextMeta?.kind === "trade") {
                dispatchTradeChatUnreadUpdated({
                  source: "community-messenger-room-open-read",
                  key: snapAfter.room.contextMeta.postId ?? id,
                  dedupeMs: 0,
                });
              }
            }
            reconcileUnreadFromServer();
            debugRoomReadAck({
              roomId: id,
              reason,
              visible: documentIsVisible(),
              focused: windowIsFocused(),
              rendered: true,
              hasDom: true,
              nearBottom: isNearBottom(messagesViewportRef.current),
              lastVisibleMessageId: serverLastId ?? lastReadMessageId,
              previousReadCursor,
              nextReadCursor: serverLastId ?? lastReadMessageId,
              debounceMs: CM_MARK_READ_SCROLL_DEBOUNCE_MS,
              optimisticApplied: true,
              serverOk: true,
              elapsedMs: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - tAnchor),
            });
          } else {
            cmReadBadgeLog("mark_read_patch_fail", {
              roomId: id,
              path: "scroll_ack",
              status: parsed.status,
              networkError: false,
              okHttp: parsed.okHttp,
              jsonOk: json.ok,
              apiError: json.error ?? null,
              responseBody: parsed.rawPreview,
              lastReadMessageId,
            });
            earlyOptimisticMessageIdRef.current = null;
            preOptimisticUnreadRef.current = null;
            const cur = roomOpenMarkReadRef.current;
            roomOpenMarkReadRef.current = {
              roomId: id,
              phase: "idle",
              lastMarkedMessageId: cur.lastMarkedMessageId,
            };
            reconcileUnreadFromServer();
            debugRoomReadAck({
              roomId: id,
              reason,
              visible: documentIsVisible(),
              focused: windowIsFocused(),
              rendered: true,
              hasDom: true,
              nearBottom: isNearBottom(messagesViewportRef.current),
              lastVisibleMessageId: lastReadMessageId,
              previousReadCursor,
              nextReadCursor: lastReadMessageId,
              debounceMs: CM_MARK_READ_SCROLL_DEBOUNCE_MS,
              optimisticApplied: true,
              serverOk: false,
              elapsedMs: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - tAnchor),
            });
          }
        } catch (err) {
          cmReadBadgeLog("mark_read_patch_fail", {
            roomId: id,
            path: "scroll_ack",
            networkError: true,
            error: err instanceof Error ? err.message : String(err),
            lastReadMessageId,
          });
          earlyOptimisticMessageIdRef.current = null;
          preOptimisticUnreadRef.current = null;
          const cur = roomOpenMarkReadRef.current;
          roomOpenMarkReadRef.current = {
            roomId: id,
            phase: "idle",
            lastMarkedMessageId: cur.lastMarkedMessageId,
          };
          reconcileUnreadFromServer();
          debugRoomReadAck({
            roomId: id,
            reason,
            visible: documentIsVisible(),
            focused: windowIsFocused(),
            rendered: true,
            hasDom: true,
            nearBottom: isNearBottom(messagesViewportRef.current),
            lastVisibleMessageId: lastReadMessageId,
            previousReadCursor,
            nextReadCursor: lastReadMessageId,
            debounceMs: CM_MARK_READ_SCROLL_DEBOUNCE_MS,
            optimisticApplied: true,
            serverOk: false,
            elapsedMs: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - tAnchor),
          });
        } finally {
          clearTimeout(timeout);
        }
      })();
    };

    const resolveReadCandidate = (reason: RoomReadAckReason): string | null => {
      if (cancelled) return null;
      const snap = snapshotRef.current;
      if (!snap || String(snap.room.id) !== String(id)) return null;

      const lastIdEarly = lastMarkableMessageId(roomMessagesRef.current, snap.messages);
      if (roomOpenMarkReadRef.current.phase === "done") {
        const markedEarly = roomOpenMarkReadRef.current.lastMarkedMessageId ?? null;
        if (
          snap.room.unreadCount >= 1 ||
          (Boolean(lastIdEarly) && Boolean(markedEarly) && lastIdEarly !== markedEarly)
        ) {
          const cur = roomOpenMarkReadRef.current;
          roomOpenMarkReadRef.current = {
            roomId: id,
            phase: "idle",
            lastMarkedMessageId: cur.lastMarkedMessageId,
          };
        }
      }
      if (roomOpenMarkReadRef.current.phase !== "idle") return null;

      const lastId = lastIdEarly;
      if (!lastId || roomOpenMarkReadRef.current.lastMarkedMessageId === lastId) return null;

      const state = isRoomActuallyReadableState({
        roomId: id,
        snapshot: snap,
        roomMessages: roomMessagesRef.current,
        roomLoading: roomLoadingRef.current,
        overlayBlocked: readPhase1OverlayBlockedRef.current,
      });
      const vp = messagesViewportRef.current;
      const nearBottom = isNearBottom(vp);
      const lastVisible = getLastVisibleUnreadMessage(vp, lastId);
      const hintId = peerTailMarkReadHintRef?.current?.trim() ?? "";
      const peerTailViewportBypass =
        Boolean(lastId) &&
        hintId !== "" &&
        hintId === lastId &&
        (nearBottom || stickToBottomRef.current);
      const viewportOk = lastVisible.domExists && (nearBottom || lastVisible.visible || peerTailViewportBypass);
      if (!state.readable || !viewportOk) {
        cmRtReadSyncLog("event_ignored_reason", {
          roomId: id,
          viewerUserId: snap.viewerUserId,
          ignoredReason: !state.readable ? "room_not_readable_state" : "viewport_not_ok",
          visible: state.visible,
          focused: state.focused,
          routeMatches: state.routeMatches,
          rendered: state.rendered,
          blocked: state.blocked,
          nearBottom,
          viewportOk,
        });
        debugRoomReadAck({
          roomId: id,
          reason,
          visible: state.visible,
          focused: state.focused,
          rendered: state.rendered,
          hasDom: lastVisible.domExists,
          nearBottom,
          lastVisibleMessageId: lastVisible.visible ? lastVisible.id : null,
          previousReadCursor: roomOpenMarkReadRef.current.lastMarkedMessageId ?? null,
          nextReadCursor: lastId,
          debounceMs: CM_MARK_READ_SCROLL_DEBOUNCE_MS,
          optimisticApplied: false,
        });
        return null;
      }

      if (readMarkReadyRecordedRoomRef.current !== id) {
        readMarkReadyRecordedRoomRef.current = id;
        recordRouteEntryElapsedMetric("messenger_room_entry", "read_mark_ready_ms");
      }

      return lastId;
    };

    const scheduleRoomReadAck = (reason: RoomReadAckReason) => {
      clearScheduledReadAck();
      const run = () => {
        readAckRafId = null;
        if (cancelled) return;
        const candidate = resolveReadCandidate(reason);
        if (!candidate) {
          maybeRollbackEarlyOptimisticBadge(reason);
          return;
        }
        const snapEarly = snapshotRef.current;
        if (snapEarly && String(snapEarly.room.id) === String(id)) {
          tryEarlyOptimisticListBadgeClear(reason, candidate, snapEarly);
        }
        readAckDebounceTimer = setTimeout(() => {
          readAckDebounceTimer = null;
          if (cancelled) return;
          const candidateAfterDwell = resolveReadCandidate(reason);
          if (!candidateAfterDwell) {
            maybeRollbackEarlyOptimisticBadge("rollback");
            return;
          }
          flushRoomReadAck(reason, candidateAfterDwell);
        }, CM_MARK_READ_SCROLL_DEBOUNCE_MS);
      };
      if (typeof requestAnimationFrame === "function") {
        readAckRafId = requestAnimationFrame(run);
      } else {
        run();
      }
    };

    const onVisibility = () => {
      if (documentIsVisible()) scheduleRoomReadAck("visibility-return");
      else {
        clearScheduledReadAck();
        maybeRollbackEarlyOptimisticBadge("visibility-hidden");
      }
    };
    const onFocus = () => scheduleRoomReadAck("focus-return");
    const onBlur = () => {
      clearScheduledReadAck();
      maybeRollbackEarlyOptimisticBadge("blur");
    };
    const onResize = () => scheduleRoomReadAck("resize");
    const onViewportScroll = () => scheduleRoomReadAck("near-bottom");
    const viewport = messagesViewportRef.current;
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onResize);
    viewport?.addEventListener("scroll", onViewportScroll, { passive: true });
    if (readMarkEffectEndRecordedRoomRef.current !== id) {
      readMarkEffectEndRecordedRoomRef.current = id;
      recordRouteEntryElapsedMetric("messenger_room_entry", "read_mark_effect_end_ms");
    }
    let mutationDebounce: ReturnType<typeof setTimeout> | null = null;
    const mutationScheduleReevaluate = () => {
      if (mutationDebounce != null) clearTimeout(mutationDebounce);
      mutationDebounce = setTimeout(() => {
        mutationDebounce = null;
        scheduleRoomReadAck("mutation");
      }, 40);
    };
    let mutationObserver: MutationObserver | null = null;
    if (viewport && typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(mutationScheduleReevaluate);
      mutationObserver.observe(viewport, { childList: true, subtree: true });
    }

    const readGateLatestMessageId = lastMarkableMessageId(
      roomMessagesRef.current,
      snapshotRef.current?.messages
    );
    const previousReadGateMessageId = lastSeenReadGateMessageIdRef.current;
    lastSeenReadGateMessageIdRef.current = readGateLatestMessageId;
    const firstScheduleReason: RoomReadAckReason =
      previousReadGateMessageId != null && readGateLatestMessageId !== previousReadGateMessageId
        ? "incoming-visible"
        : "initial-render";

    /** 진입 직후 가드+낙관+flushOpen 1회 — 스크롤 게이트는 커서 정합용 보조. */
    queueMicrotask(() => {
      runImmediateOpenFlushOnce();
      scheduleRoomReadAck(firstScheduleReason);
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          runImmediateOpenFlushOnce();
          scheduleRoomReadAck(firstScheduleReason);
        });
      }
    });
    return () => {
      cancelled = true;
      clearScheduledReadAck();
      if (earlyOptimisticMessageIdRef.current && roomOpenMarkReadRef.current.phase === "idle") {
        reconcileUnreadFromServer();
      }
      earlyOptimisticMessageIdRef.current = null;
      preOptimisticUnreadRef.current = null;
      if (mutationDebounce != null) clearTimeout(mutationDebounce);
      mutationObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onResize);
      viewport?.removeEventListener("scroll", onViewportScroll);
    };
  }, [
    roomId,
    snapshotRef,
    roomOpenMarkReadRef,
    stickToBottomRef,
    roomMessagesRef,
    messagesViewportRef,
    readPhase1OverlayBlockedRef,
    roomLoadingRef,
    readGateVersion,
    peerTailMarkReadHintRef,
  ]);
}
