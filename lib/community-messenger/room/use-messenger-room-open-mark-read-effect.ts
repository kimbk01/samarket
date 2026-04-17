"use client";

import { useEffect, type MutableRefObject, type RefObject } from "react";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import { CM_ROOM_BOTTOM_READ_DWELL_MS } from "@/lib/community-messenger/room/messenger-room-ui-constants";
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

const READ_DWELL_TICK_MS = 200;

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

/**
 * 미읽음이 있을 때만: **타임라인 하단에 머문 상태**가 `CM_ROOM_BOTTOM_READ_DWELL_MS` 이상 지속되면 `mark_read` 1회.
 * (탭만 열리거나 위 스크롤만 한 경우에는 읽음 처리하지 않음 — 알림·목록 미읽음과 상대 읽음 표시 정합)
 */
export function useMessengerRoomOpenMarkReadEffect(args: {
  roomId: string;
  snapshotRef: RefObject<CommunityMessengerRoomSnapshot | null>;
  roomOpenMarkReadRef: MessengerRoomOpenMarkReadPhaseRef;
  stickToBottomRef: MutableRefObject<boolean>;
  roomMessagesRef: MutableRefObject<Array<CommunityMessengerMessage & { pending?: boolean }>>;
}): void {
  const { roomId, snapshotRef, roomOpenMarkReadRef, stickToBottomRef, roomMessagesRef } = args;

  useEffect(() => {
    const id = roomId?.trim();
    if (!id) return;

    if (roomOpenMarkReadRef.current.roomId !== id) {
      roomOpenMarkReadRef.current = { roomId: id, phase: "idle" };
    }

    let dwellStartAt: number | null = null;
    let dwellAnchorMessageId: string | null = null;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const snap = snapshotRef.current;
      if (!snap || String(snap.room.id) !== String(id)) return;

      if (snap.room.unreadCount >= 1 && roomOpenMarkReadRef.current.phase === "done") {
        roomOpenMarkReadRef.current = { roomId: id, phase: "idle" };
      }
      if (roomOpenMarkReadRef.current.phase !== "idle") {
        dwellStartAt = null;
        dwellAnchorMessageId = null;
        return;
      }
      if (snap.room.unreadCount < 1) {
        dwellStartAt = null;
        dwellAnchorMessageId = null;
        return;
      }

      const visible =
        typeof document === "undefined" ? true : document.visibilityState === "visible";
      const focused = typeof document === "undefined" ? true : document.hasFocus();
      const atBottom = stickToBottomRef.current;
      const lastId = lastMarkableMessageId(roomMessagesRef.current, snap.messages);

      if (!visible || !focused || !atBottom || !lastId) {
        dwellStartAt = null;
        dwellAnchorMessageId = null;
        return;
      }

      const now = Date.now();
      if (dwellStartAt == null || dwellAnchorMessageId !== lastId) {
        dwellStartAt = now;
        dwellAnchorMessageId = lastId;
        return;
      }

      if (now - dwellStartAt < CM_ROOM_BOTTOM_READ_DWELL_MS) return;

      roomOpenMarkReadRef.current.phase = "in_flight";
      dwellStartAt = null;
      dwellAnchorMessageId = null;
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
          if (res.ok && json.ok && typeof performance !== "undefined") {
            messengerMonitorUnreadListSync(id, Math.round(performance.now() - t0), "room_open");
            roomOpenMarkReadRef.current.phase = "done";
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

    const iv = window.setInterval(tick, READ_DWELL_TICK_MS);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, [roomId, snapshotRef, roomOpenMarkReadRef, stickToBottomRef, roomMessagesRef]);
}
