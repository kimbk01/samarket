"use client";

import { useEffect } from "react";
import { onCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import type { MessengerRoomBootstrapRefreshFn } from "@/lib/community-messenger/room/use-messenger-room-bootstrap-lifecycle";
import { scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";

const VISIBILITY_CATCHUP_COOLDOWN_MS = 4_000;
const BUS_CATCHUP_COOLDOWN_MS = 2_000;
/** 탭 복귀 직후 full bootstrap refresh 금지 — idle 이후 catch-up 만 */
const VISIBILITY_RESTORE_QUIET_MS = 900;

/**
 * 통화 종료 후 탭 복귀 시 스냅샷 정합, 멀티탭에서 동일 방 메시지 시 증분 catch-up.
 * `useMessengerRoomClientPhase1` 의 visibility / bus `useEffect` 쌍을 그대로 분리.
 */
export function useMessengerRoomVisibilityBusCatchup({
  roomId,
  streamRoomId,
  catchUpNewerMessages,
  refresh,
}: {
  roomId: string;
  streamRoomId: string;
  catchUpNewerMessages: () => Promise<boolean>;
  refresh: MessengerRoomBootstrapRefreshFn;
}): void {
  /** 통화 종료 직후 다른 탭에서 돌아올 때 스냅샷(activeCall)이 잠깐 옛값이면 배너가 남는 경우 완화 */
  useEffect(() => {
    let lastBumpAt = 0;
    let hiddenAt = 0;
    const bump = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") {
        hiddenAt = Date.now();
        return;
      }
      const now = Date.now();
      if (hiddenAt > 0 && now - hiddenAt < VISIBILITY_RESTORE_QUIET_MS) return;
      if (now - lastBumpAt < VISIBILITY_CATCHUP_COOLDOWN_MS) return;
      lastBumpAt = now;
      scheduleWhenBrowserIdle(() => {
        void (async () => {
          const merged = await catchUpNewerMessages();
          if (merged) return;
          void refresh(true, { triggerReason: "visibilitychange" });
        })();
      }, 1200);
    };
    document.addEventListener("visibilitychange", bump);
    window.addEventListener("pageshow", bump);
    return () => {
      document.removeEventListener("visibilitychange", bump);
      window.removeEventListener("pageshow", bump);
    };
  }, [catchUpNewerMessages, refresh]);

  // Multi-tab: another tab sent a message in this room -> catch up quickly without full reload storms.
  useEffect(() => {
    const route = roomId?.trim();
    const stream = streamRoomId?.trim();
    if (!route && !stream) return;
    let lastAt = 0;
    return onCommunityMessengerBusEvent((ev) => {
      if (ev.type === "cm.room.local_unread" || ev.type === "cm.home.merge_room_summary") return;
      if (ev.type !== "cm.room.message_sent" && ev.type !== "cm.room.bump") return;
      const evr = ev.roomId.trim();
      if (evr !== route && evr !== stream) return;
      const now = Date.now();
      if (now - lastAt < BUS_CATCHUP_COOLDOWN_MS) return;
      lastAt = now;
      scheduleWhenBrowserIdle(() => {
        void (async () => {
          const merged = await catchUpNewerMessages();
          if (merged) return;
          void refresh(true, { triggerReason: "realtime_bus" });
        })();
      }, 640);
    });
  }, [catchUpNewerMessages, refresh, roomId, streamRoomId]);
}
