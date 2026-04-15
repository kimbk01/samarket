"use client";

import { useEffect, type MutableRefObject } from "react";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { cancelScheduledWhenBrowserIdle, scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";

type Args = {
  roomId: string;
  initialServerSnapshot: CommunityMessengerRoomSnapshot | null | undefined;
  refresh: (silent?: boolean) => Promise<void>;
  loadedRef: MutableRefObject<boolean>;
  setRoomReadyForRealtime: (open: boolean) => void;
};

/**
 * 방 페이지: RSC 스냅샷이 있으면 첫 bootstrap GET 생략 후 idle 사일런트 갱신,
 * 없으면 차단 로드. `useMessengerRoomClientPhase1` 의 네트워크 정책을 한 곳에 둔다.
 */
export function useMessengerRoomBootstrapLifecycle({
  roomId,
  initialServerSnapshot,
  refresh,
  loadedRef,
  setRoomReadyForRealtime,
}: Args): void {
  useEffect(() => {
    setRoomReadyForRealtime(false);
    if (initialServerSnapshot) {
      loadedRef.current = true;
      setRoomReadyForRealtime(true);
      const idleId = scheduleWhenBrowserIdle(() => {
        void refresh(true);
      }, 2800);
      return () => cancelScheduledWhenBrowserIdle(idleId);
    }
    void refresh(false);
    // `initialServerSnapshot` 은 RSC 재실행마다 새 참조일 수 있어 deps 에 넣지 않음. 방 전환은 `roomId` 로 마운트 분리.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialServerSnapshot 의도적 제외(위 주석)
  }, [refresh, roomId, setRoomReadyForRealtime]);
}
