"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { messengerRolloutUsesRoomScrollHints } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";

/**
 * 방 전환 시 reader badge 힌트만 정리.
 * scrollTop persist는 ScrollAnchorController 가 unmount 시 저장 — at-bottom 강제 없음.
 *
 * PR-1 검토 #2 (F2): 떠날 때 정리는 rollout level ≥3 에서만 돌아(기본 level 2) 지난 방문의 「at-bottom」 이 남았다 →
 * 재진입 첫 그림에서 「reached latest」 효과가 진입 미읽음 세션·구분선을 지울 수 있었다.
 * 방(라우트 id·스트림 id)이 열릴 때 level 과 무관하게 그 방 읽기 상태를 지운다 — paint 전(layout effect).
 * 위치는 진입 완료 viewport 동기화가 다시 쓴다. 그 전에는 위치가 없으므로 「↓」를 그리지 않는다
 * (`resolveMessengerRoomJumpLatestFab`).
 */
export function useMessengerRoomReaderScrollRoomLifecycle({
  roomId,
  streamRoomId,
}: {
  roomId: string;
  streamRoomId?: string;
}): void {
  /** 같은 방 세션 안에서 id 마다 1번만 — 스냅샷 도착으로 스트림 id 가 바뀌어도 이미 쓴 위치를 다시 지우지 않게 */
  const clearedRef = useRef<{ roomId: string; ids: Set<string> }>({ roomId: "", ids: new Set() });
  useLayoutEffect(() => {
    const rid = roomId?.trim() ?? "";
    if (clearedRef.current.roomId !== rid) clearedRef.current = { roomId: rid, ids: new Set() };
    const store = useMessengerRoomReaderStateStore.getState();
    for (const id of [rid, streamRoomId?.trim() ?? ""]) {
      if (!id || clearedRef.current.ids.has(id)) continue;
      clearedRef.current.ids.add(id);
      store.clearRoom(id);
    }
  }, [roomId, streamRoomId]);

  useEffect(() => {
    const id = roomId?.trim();
    return () => {
      if (id && messengerRolloutUsesRoomScrollHints()) {
        useMessengerRoomReaderStateStore.getState().clearRoom(id);
      }
    };
  }, [roomId]);
}
