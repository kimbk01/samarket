"use client";

import { useEffect, type MutableRefObject } from "react";
import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import { messengerMonitorUnreadListSync } from "@/lib/community-messenger/monitoring/client";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

export type MessengerRoomOpenMarkReadPhaseRef = MutableRefObject<{
  roomId: string | null;
  phase: "idle" | "in_flight" | "done";
}>;

/**
 * 스냅샷에 미읽음이 있으면 방 열람으로 읽음 처리 — 목록·배지와 서버 정합(모니터링 `room_open`).
 */
export function useMessengerRoomOpenMarkReadEffect(args: {
  roomId: string;
  snapshot: CommunityMessengerRoomSnapshot | null;
  roomOpenMarkReadRef: MessengerRoomOpenMarkReadPhaseRef;
}): void {
  const { roomId, snapshot, roomOpenMarkReadRef } = args;

  useEffect(() => {
    const id = roomId?.trim();
    if (!id) return;
    if (roomOpenMarkReadRef.current.roomId !== id) {
      roomOpenMarkReadRef.current = { roomId: id, phase: "idle" };
    }
    if (!snapshot) return;
    if (String(snapshot.room.id) !== String(id)) return;
    /** 첫 `mark_read` 후 `done` 이면 이후 미읽음이 와도 영구 차단되던 문제 — 다시 idle */
    if (snapshot.room.unreadCount >= 1 && roomOpenMarkReadRef.current.phase === "done") {
      roomOpenMarkReadRef.current = { roomId: id, phase: "idle" };
    }
    if (roomOpenMarkReadRef.current.phase !== "idle") return;
    if (snapshot.room.unreadCount < 1) return;
    const lastVisibleMessageId = snapshot.messages[snapshot.messages.length - 1]?.id ?? null;
    roomOpenMarkReadRef.current.phase = "in_flight";
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    void (async () => {
      try {
        const res = await fetch(communityMessengerRoomResourcePath(id), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "mark_read", lastReadMessageId: lastVisibleMessageId }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
        if (res.ok && json.ok && typeof performance !== "undefined") {
          messengerMonitorUnreadListSync(id, Math.round(performance.now() - t0), "room_open");
          roomOpenMarkReadRef.current.phase = "done";
          postCommunityMessengerBusEvent({ type: "cm.room.bump", roomId: id, at: Date.now() });
        } else {
          roomOpenMarkReadRef.current.phase = "idle";
        }
      } catch {
        roomOpenMarkReadRef.current.phase = "idle";
      }
    })();
  }, [roomId, snapshot]);
}
