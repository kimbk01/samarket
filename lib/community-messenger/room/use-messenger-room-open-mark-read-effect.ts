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
import type {
  CommunityMessengerMessage,
  CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";

export type MessengerRoomOpenMarkReadPhaseRef = MutableRefObject<{
  roomId: string | null;
  phase: "idle" | "in_flight" | "done";
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
 * 미읽음이 있을 때만: **메시지 리스트가 보이는 상태**에서
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

      if (snap.room.unreadCount >= 1 && roomOpenMarkReadRef.current.phase === "done") {
        roomOpenMarkReadRef.current = { roomId: id, phase: "idle" };
      }
      if (roomOpenMarkReadRef.current.phase !== "idle") {
        dwellStartAt = null;
        dwellAnchorMessageId = null;
        clearDwellTimer();
        return;
      }
      if (snap.room.unreadCount < 1) {
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
      const lastId = lastMarkableMessageId(roomMessagesRef.current, snap.messages);
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
        }, CM_ROOM_BOTTOM_READ_DWELL_MS);
        return;
      }

      if (now - dwellStartAt < CM_ROOM_BOTTOM_READ_DWELL_MS) {
        clearDwellTimer();
        dwellTimer = setTimeout(() => {
          dwellTimer = null;
          reevaluate();
        }, CM_ROOM_BOTTOM_READ_DWELL_MS - (now - dwellStartAt));
        return;
      }

      roomOpenMarkReadRef.current.phase = "in_flight";
      dwellStartAt = null;
      dwellAnchorMessageId = null;
      clearDwellTimer();
      const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
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
            roomOpenMarkReadRef.current.phase = "done";
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
            roomOpenMarkReadRef.current.phase = "idle";
          }
        } catch {
          roomOpenMarkReadRef.current.phase = "idle";
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
  ]);
}
