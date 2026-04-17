"use client";

import { useEffect, type MutableRefObject, type RefObject } from "react";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import {
  CM_READ_LATEST_MESSAGE_MIN_VISIBLE_RATIO,
  CM_ROOM_BOTTOM_READ_DWELL_MS,
} from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { isMessengerRoomReadGateExtraBlocked } from "@/lib/community-messenger/room/messenger-room-read-gate";
import { messengerMonitorUnreadListSync } from "@/lib/community-messenger/monitoring/client";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { requestMessengerHubBadgeResync } from "@/lib/community-messenger/notifications/messenger-notification-contract";
import { applyRoomReadEvent } from "@/lib/community-messenger/stores/messenger-realtime-store";
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

/**
 * **메시지 리스트가 보이는 상태**에서(unread 0 이어도 타임라인 최신 id 가 바뀌면 상대 읽음 커서 진행)
 * - 탭/창 활성 + 하단 고정 + **최신 말풍선이 뷰포트에 실제로 노출**
 * - 시트·액션·라이트박스·통화 패널 등 **오버레이 없음**
 * - `CM_ROOM_BOTTOM_READ_DWELL_MS` 이상 유지
 * 될 때만 `mark_read` 1회 (presence·방 입장만으로는 읽음 처리하지 않음)
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
  /** 하단 체류 후 `mark_read` 지연 — 0 이면 조건 충족 시 즉시 PATCH */
  readBottomDwellMs?: number;
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
    readBottomDwellMs = CM_ROOM_BOTTOM_READ_DWELL_MS,
  } = args;

  useEffect(() => {
    const id = roomId?.trim();
    if (!id) return;

    if (roomOpenMarkReadRef.current.roomId !== id) {
      roomOpenMarkReadRef.current = { roomId: id, phase: "idle" };
    }

    let dwellStartAt: number | null = null;
    let dwellAnchorMessageId: string | null = null;
    let cancelled = false;
    let dwellTimer: ReturnType<typeof setTimeout> | null = null;

    const clearDwellTimer = () => {
      if (dwellTimer != null) {
        clearTimeout(dwellTimer);
        dwellTimer = null;
      }
    };

    const reevaluate = () => {
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
        dwellStartAt = null;
        dwellAnchorMessageId = null;
        clearDwellTimer();
        return;
      }
      const lastId = lastIdEarly;
      if (lastId && roomOpenMarkReadRef.current.lastMarkedMessageId === lastId) {
        dwellStartAt = null;
        dwellAnchorMessageId = null;
        clearDwellTimer();
        return;
      }

      if (roomLoadingRef.current || readPhase1OverlayBlockedRef.current || isMessengerRoomReadGateExtraBlocked()) {
        dwellStartAt = null;
        dwellAnchorMessageId = null;
        clearDwellTimer();
        return;
      }

      const visible =
        typeof document === "undefined" ? true : document.visibilityState === "visible";
      const focused = typeof document === "undefined" ? true : document.hasFocus();
      const atBottom = stickToBottomRef.current;
      const vp = messagesViewportRef.current;
      const latestVisible = isLatestMessageVisibleEnoughInViewport(vp, lastId);

      if (!visible || !focused || !atBottom || !lastId || !latestVisible) {
        dwellStartAt = null;
        dwellAnchorMessageId = null;
        clearDwellTimer();
        return;
      }

      const now = Date.now();
      if (dwellStartAt == null || dwellAnchorMessageId !== lastId) {
        dwellStartAt = now;
        dwellAnchorMessageId = lastId;
        clearDwellTimer();
        dwellTimer = setTimeout(() => {
          dwellTimer = null;
          reevaluate();
        }, readBottomDwellMs);
        return;
      }

      if (now - dwellStartAt < readBottomDwellMs) {
        clearDwellTimer();
        dwellTimer = setTimeout(() => {
          dwellTimer = null;
          reevaluate();
        }, readBottomDwellMs - (now - dwellStartAt));
        return;
      }

      roomOpenMarkReadRef.current.phase = "in_flight";
      dwellStartAt = null;
      dwellAnchorMessageId = null;
      clearDwellTimer();
      const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
      applyRoomReadEvent({
        viewerUserId: snap.viewerUserId,
        roomId: id,
        lastReadMessageId: lastId,
      });
      postCommunityMessengerBusEvent({
        type: "cm.room.read",
        roomId: id,
        viewerUserId: snap.viewerUserId,
        lastReadMessageId: lastId,
        at: Date.now(),
      });
      void (async () => {
        try {
          const res = await fetch(communityMessengerRoomResourcePath(id), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ action: "mark_read", lastReadMessageId: lastId }),
          });
          const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
          if (res.ok && json.ok) {
            if (typeof performance !== "undefined") {
              messengerMonitorUnreadListSync(id, Math.round(performance.now() - t0), "room_open");
            }
            roomOpenMarkReadRef.current = {
              roomId: id,
              phase: "done",
              lastMarkedMessageId: lastId,
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
            }
            postCommunityMessengerBusEvent({ type: "cm.room.bump", roomId: id, at: Date.now() });
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

    const onVisibility = () => reevaluate();
    const onFocus = () => reevaluate();
    const onResize = () => reevaluate();
    const onViewportScroll = () => reevaluate();
    const viewport = messagesViewportRef.current;
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("resize", onResize);
    viewport?.addEventListener("scroll", onViewportScroll, { passive: true });
    queueMicrotask(() => {
      reevaluate();
    });
    return () => {
      cancelled = true;
      clearDwellTimer();
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
    readBottomDwellMs,
  ]);
}
