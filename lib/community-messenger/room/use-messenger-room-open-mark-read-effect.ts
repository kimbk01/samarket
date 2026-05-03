"use client";

import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
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
import { applyRoomReadEvent } from "@/lib/community-messenger/stores/messenger-realtime-store";
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

/**
 * - **방 진입 1회**: `flushOpen` — 서버 꼬리까지 배치 읽음 (카카오식·뷰포트 불필요·포그라운드만).
 * - **이후 꼬리**: 포그라운드 + 대화 하단 가시 시 `mark_read` 커서 — 스크롤은 debounce.
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

  const enterFlushCompletedRef = useRef(false);
  useEffect(() => {
    enterFlushCompletedRef.current = false;
  }, [roomId]);

  const readMarkReadyRecordedRoomRef = useRef<string | null>(null);
  const unreadReadSyncRecordedRoomRef = useRef<string | null>(null);
  const readMarkEffectStartRecordedRoomRef = useRef<string | null>(null);
  const readMarkEffectEndRecordedRoomRef = useRef<string | null>(null);
  const readMarkEffectCountRef = useRef(0);

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
    }

    let cancelled = false;
    let scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    const clearScrollDebounce = () => {
      if (scrollDebounceTimer != null) {
        clearTimeout(scrollDebounceTimer);
        scrollDebounceTimer = null;
      }
    };

    const patchMarkRead = (opts: { flushOpen: boolean; lastReadMessageId?: string | null }) => {
      const snap = snapshotRef.current;
      if (!snap || String(snap.room.id) !== String(id)) return;
      if (roomOpenMarkReadRef.current.phase !== "idle") return;

      const optimisticId =
        opts.flushOpen === true ? lastMarkableMessageId(roomMessagesRef.current, snap.messages) : opts.lastReadMessageId ?? null;

      roomOpenMarkReadRef.current.phase = "in_flight";
      const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();

      applyRoomReadEvent({
        viewerUserId: snap.viewerUserId,
        roomId: id,
        lastReadMessageId: optimisticId ?? undefined,
      });
      postCommunityMessengerBusEvent({
        type: "cm.room.read",
        roomId: id,
        viewerUserId: snap.viewerUserId,
        lastReadMessageId: optimisticId,
        at: Date.now(),
      });

      void (async () => {
        try {
          const res = await fetch(communityMessengerRoomResourcePath(id), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(
              opts.flushOpen ? { action: "mark_read", flushOpen: true } : { action: "mark_read", lastReadMessageId: opts.lastReadMessageId }
            ),
          });
          const json = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            lastReadMessageId?: string | null;
          };
          const serverLastId =
            typeof json.lastReadMessageId === "string" && json.lastReadMessageId.trim()
              ? json.lastReadMessageId.trim()
              : opts.lastReadMessageId ?? optimisticId;

          if (res.ok && json.ok) {
            if (opts.flushOpen === true) {
              enterFlushCompletedRef.current = true;
            }
            if (peerTailMarkReadHintRef?.current && peerTailMarkReadHintRef.current === (opts.lastReadMessageId ?? optimisticId)) {
              peerTailMarkReadHintRef.current = null;
            }
            if (typeof performance !== "undefined") {
              const unreadReadSyncMs = Math.round(performance.now() - t0);
              messengerMonitorUnreadListSync(id, unreadReadSyncMs, opts.flushOpen ? "room_open" : "mark_read");
              if (unreadReadSyncRecordedRoomRef.current !== id) {
                unreadReadSyncRecordedRoomRef.current = id;
                recordRouteEntryMetric("messenger_room_entry", "unread_read_sync_ms", unreadReadSyncMs);
              }
            }
            roomOpenMarkReadRef.current = {
              roomId: id,
              phase: "done",
              lastMarkedMessageId: serverLastId ?? null,
            };
            const snapAfter = snapshotRef.current;
            if (snapAfter && String(snapAfter.room.id) === String(id)) {
              postCommunityMessengerBusEvent({
                type: "cm.room.local_unread",
                roomId: id,
                viewerUserId: snapAfter.viewerUserId,
                unreadCount: 0,
                at: Date.now(),
              });
              if (snapAfter.room.contextMeta?.kind === "trade") {
                dispatchTradeChatUnreadUpdated({
                  source: "community-messenger-room-open-read",
                  key: snapAfter.room.contextMeta.postId ?? id,
                  dedupeMs: 0,
                });
              }
            }
            requestMessengerHubBadgeResync("room_open_mark_read");
          } else {
            const cur = roomOpenMarkReadRef.current;
            roomOpenMarkReadRef.current = {
              roomId: id,
              phase: "idle",
              lastMarkedMessageId: cur.lastMarkedMessageId,
            };
          }
        } catch {
          const cur = roomOpenMarkReadRef.current;
          roomOpenMarkReadRef.current = {
            roomId: id,
            phase: "idle",
            lastMarkedMessageId: cur.lastMarkedMessageId,
          };
        }
      })();
    };

    const reevaluate = (opts?: { tailOnly?: boolean }) => {
      if (cancelled) return;
      const snap = snapshotRef.current;
      if (!snap || String(snap.room.id) !== String(id)) return;

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
      if (roomOpenMarkReadRef.current.phase !== "idle") {
        clearScrollDebounce();
        return;
      }

      const lastId = lastIdEarly;
      if (lastId && roomOpenMarkReadRef.current.lastMarkedMessageId === lastId) {
        clearScrollDebounce();
        return;
      }

      if (roomLoadingRef.current || readPhase1OverlayBlockedRef.current || isMessengerRoomReadGateExtraBlocked()) {
        clearScrollDebounce();
        return;
      }

      const visible = typeof document === "undefined" ? true : document.visibilityState === "visible";
      if (!visible) {
        clearScrollDebounce();
        return;
      }

      /** 진입 플러시 전에는 스크롤 기반 커서 PATCH 금지 (순서 꼬임 방지) */
      if (opts?.tailOnly && !enterFlushCompletedRef.current) {
        return;
      }

      /** [3] 방 진입 즉시 플러시 — 로딩 종료·오버레이 없음·포그라운드 */
      if (!opts?.tailOnly && !enterFlushCompletedRef.current) {
        clearScrollDebounce();
        patchMarkRead({ flushOpen: true });
        return;
      }

      const atBottom = stickToBottomRef.current;
      const vp = messagesViewportRef.current;
      const threadTailByScroll = isMessagesViewportShowingThreadTail(vp, CM_MARK_READ_VIEWPORT_BOTTOM_GAP_PX);
      const latestVisible = isLatestMessageVisibleEnoughInViewport(vp, lastId);
      const latestDomMissing =
        Boolean(lastId) &&
        (typeof document === "undefined" ? false : document.getElementById(`cm-room-msg-${lastId}`) == null);
      const hintId = peerTailMarkReadHintRef?.current?.trim() ?? "";
      const peerTailViewportBypass =
        Boolean(lastId) &&
        hintId !== "" &&
        hintId === lastId &&
        (threadTailByScroll || atBottom);
      const viewportOk =
        Boolean(lastId) &&
        (threadTailByScroll ||
          latestVisible ||
          (atBottom && latestDomMissing) ||
          peerTailViewportBypass);

      if (!viewportOk || !lastId) {
        clearScrollDebounce();
        return;
      }

      if (readMarkReadyRecordedRoomRef.current !== id) {
        readMarkReadyRecordedRoomRef.current = id;
        recordRouteEntryElapsedMetric("messenger_room_entry", "read_mark_ready_ms");
      }

      clearScrollDebounce();
      scrollDebounceTimer = setTimeout(() => {
        scrollDebounceTimer = null;
        if (cancelled) return;
        if (roomOpenMarkReadRef.current.phase !== "idle") return;
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        if (roomLoadingRef.current || readPhase1OverlayBlockedRef.current || isMessengerRoomReadGateExtraBlocked()) return;

        const snap2 = snapshotRef.current;
        if (!snap2 || String(snap2.room.id) !== String(id)) return;
        const lastId2 = lastMarkableMessageId(roomMessagesRef.current, snap2.messages);
        if (!lastId2 || roomOpenMarkReadRef.current.lastMarkedMessageId === lastId2) return;

        const vp2 = messagesViewportRef.current;
        const threadOk = isMessagesViewportShowingThreadTail(vp2, CM_MARK_READ_VIEWPORT_BOTTOM_GAP_PX);
        const latestOk = isLatestMessageVisibleEnoughInViewport(vp2, lastId2);
        const domMiss =
          Boolean(lastId2) &&
          (typeof document === "undefined" ? false : document.getElementById(`cm-room-msg-${lastId2}`) == null);
        const hint2 = peerTailMarkReadHintRef?.current?.trim() ?? "";
        const bypass =
          Boolean(lastId2) &&
          hint2 !== "" &&
          hint2 === lastId2 &&
          (threadOk || stickToBottomRef.current);
        const ok =
          threadOk ||
          latestOk ||
          (stickToBottomRef.current && domMiss) ||
          bypass;
        if (!ok) return;

        patchMarkRead({ flushOpen: false, lastReadMessageId: lastId2 });
      }, CM_MARK_READ_SCROLL_DEBOUNCE_MS);
    };

    const onVisibility = () => reevaluate();
    const onFocus = () => reevaluate();
    const onResize = () => reevaluate();
    const onViewportScroll = () => reevaluate({ tailOnly: true });
    const viewport = messagesViewportRef.current;
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
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
        reevaluate();
      }, 40);
    };
    let mutationObserver: MutationObserver | null = null;
    if (viewport && typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(mutationScheduleReevaluate);
      mutationObserver.observe(viewport, { childList: true, subtree: true });
    }

    queueMicrotask(() => {
      reevaluate();
      requestAnimationFrame(() => {
        reevaluate();
        requestAnimationFrame(() => {
          reevaluate();
        });
      });
    });
    return () => {
      cancelled = true;
      clearScrollDebounce();
      if (mutationDebounce != null) clearTimeout(mutationDebounce);
      mutationObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
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
