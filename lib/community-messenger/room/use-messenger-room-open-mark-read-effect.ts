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

export const ROOM_OPEN_ALIGN_TRACE =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE_ROOM_OPEN_ALIGN === "1";

export type RoomOpenAlignTraceExtra = {
  phase?: string;
  store_updates_count?: number;
  bus_events_count?: number;
  /** 구독 범위 힌트 (정확한 리렌더 카운트는 프로덕션 미삽입) */
  rerender_hint?: string;
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
  /**
   * Phase1 `useLayoutEffect` 가 unread≥1 일 때 즉시 정렬·메트릭을 끝낸 경우 —
   * `flushOpen` PATCH 완료까지 기다리는 `badge_list_align` 중복·왜곡 방지.
   */
  roomOpenBadgeAlignEarlyDoneRef?: RefObject<{ roomId: string | null; done: boolean }>;
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
    roomOpenBadgeAlignEarlyDoneRef,
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

      const early = roomOpenBadgeAlignEarlyDoneRef?.current;
      /** Phase1 early 가 이미 store+bus+메트릭 완료 — 중복 zustand·BC 로 리렌더·동기 비용 절감 */
      const skipDupOptimistic =
        opts.flushOpen === true && Boolean(early?.done && early.roomId === id);

      roomOpenMarkReadRef.current.phase = "in_flight";
      const tAnchor = typeof performance !== "undefined" ? performance.now() : Date.now();
      let alignMs = 0;

      if (!skipDupOptimistic) {
        const tAlign0 = tAnchor;
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
        postCommunityMessengerBusEvent({
          type: "cm.room.local_unread",
          roomId: id,
          viewerUserId: snap.viewerUserId,
          unreadCount: 0,
          at: Date.now(),
        });
        alignMs = typeof performance !== "undefined" ? Math.round(performance.now() - tAlign0) : 0;
        if (ROOM_OPEN_ALIGN_TRACE) {
          traceRoomOpenAlignChain("patchMarkRead_sync", id, alignMs, tAnchor, {
            phase: "patchMarkRead_sync",
            store_updates_count: 1,
            bus_events_count: 2,
            rerender_hint: "messenger_store+hub_snapshot_tab(chat)+home_list_if_open",
          });
        }
      } else if (ROOM_OPEN_ALIGN_TRACE) {
        traceRoomOpenAlignChain("patchMarkRead_skip_dup", id, 0, tAnchor, {
          phase: "patchMarkRead_skip_dup",
          store_updates_count: 0,
          bus_events_count: 0,
          rerender_hint: "phase1_early_only_PATCH_background",
        });
      }

      if (typeof performance !== "undefined") {
        const skipDupRoomOpenMetric =
          opts.flushOpen === true && Boolean(early?.done && early.roomId === id);
        if (!skipDupRoomOpenMetric) {
          messengerMonitorUnreadListSync(id, alignMs, opts.flushOpen ? "room_open" : "mark_read");
          if (unreadReadSyncRecordedRoomRef.current !== id) {
            unreadReadSyncRecordedRoomRef.current = id;
            recordRouteEntryMetric("messenger_room_entry", "unread_read_sync_ms", alignMs);
          }
        } else {
          unreadReadSyncRecordedRoomRef.current = id;
        }
      }

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
            /** 낙관 스토어가 먼저 — 서버 허브 집계는 idle/다음 틱으로 (PATCH RTT 와 GET 경합 방지) */
            if (opts.flushOpen) {
              const scheduleHub = () => requestMessengerHubBadgeResync("room_open_mark_read");
              if (typeof window !== "undefined") {
                const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
                  .requestIdleCallback;
                if (typeof ric === "function") {
                  ric(() => scheduleHub(), { timeout: 1200 });
                } else {
                  window.setTimeout(scheduleHub, 320);
                }
              } else {
                scheduleHub();
              }
            } else if (typeof queueMicrotask === "function") {
              queueMicrotask(() => requestMessengerHubBadgeResync("room_phase2_mark_read"));
            } else {
              requestMessengerHubBadgeResync("room_phase2_mark_read");
            }
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

    /** 입장 flush 는 Phase1 early·microtask·다음 프레임 2회면 충분 (불필요한 rAF·reevaluate 중복 감소) */
    queueMicrotask(() => {
      reevaluate();
      requestAnimationFrame(() => {
        reevaluate();
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
    roomOpenBadgeAlignEarlyDoneRef,
  ]);
}
