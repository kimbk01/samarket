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
 * 복귀 1회 정합 — `after=` 와 최신 창 재조회를 **동시에 시작**한다.
 * 빈 방(앵커 없음)은 `catchUpNewerMessages` 가 내부에서 latest 를 single-flight 로 등록하므로
 * 여기서의 latest 호출은 같은 비행을 공유한다(이전: after= 완료 후 latest 를 한 번 더 → 빈 방 latest 2회).
 * silent_delta(`refresh(true)`, full bootstrap 아님 — 백그라운드 동안 놓친 읽음·통화 배너 정합)는
 * 기존대로 `after=` 가 새 행을 병합하지 않았을 때만.
 */
export async function runMessengerRoomVisibilityResumeCatchup(args: {
  catchUpNewerMessages: () => Promise<boolean>;
  reconcileLatestMessages?: () => Promise<boolean>;
  refresh: MessengerRoomBootstrapRefreshFn;
}): Promise<void> {
  const newer = args.catchUpNewerMessages();
  const latest = args.reconcileLatestMessages ? args.reconcileLatestMessages() : null;
  const merged = await newer;
  if (latest) void latest.catch(() => false);
  if (merged) return;
  void args.refresh(true, { triggerReason: "visibilitychange" });
}

/**
 * 통화 종료 후 탭 복귀 시 스냅샷 정합, 멀티탭에서 동일 방 메시지 시 증분 catch-up.
 * `useMessengerRoomClientPhase1` 의 visibility / bus `useEffect` 쌍을 그대로 분리.
 */
export function useMessengerRoomVisibilityBusCatchup({
  roomId,
  streamRoomId,
  catchUpNewerMessages,
  reconcileLatestMessages,
  refresh,
}: {
  roomId: string;
  streamRoomId: string;
  catchUpNewerMessages: () => Promise<boolean>;
  /** 복귀 시 최신 창 재조회 — 백그라운드 동안의 제자리 갱신·과거 created_at 기록(통화) 정합 */
  reconcileLatestMessages?: () => Promise<boolean>;
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
        /** 메시지 정합 전용 — silent_delta(읽음·통화 배너) 판단은 기존대로 `after=` 결과만 따른다. */
        void runMessengerRoomVisibilityResumeCatchup({ catchUpNewerMessages, reconcileLatestMessages, refresh });
      }, 1200);
    };
    document.addEventListener("visibilitychange", bump);
    window.addEventListener("pageshow", bump);
    return () => {
      document.removeEventListener("visibilitychange", bump);
      window.removeEventListener("pageshow", bump);
    };
  }, [catchUpNewerMessages, reconcileLatestMessages, refresh]);

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
