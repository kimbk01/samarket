"use client";

import { useEffect, type MutableRefObject } from "react";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { consumeCommunityMessengerRoomNavTap } from "@/lib/community-messenger/room-nav-timing";

type Args = {
  roomId: string;
  initialServerSnapshot: CommunityMessengerRoomSnapshot | null | undefined;
  refresh: (silent?: boolean) => Promise<void>;
  loadedRef: MutableRefObject<boolean>;
  setRoomReadyForRealtime: (open: boolean) => void;
};

/**
 * 방 페이지: 시드 스냅샷(hot/peek/RSC)이 있으면 첫 GET을 막지 않고, 보강 필요 시 곧바로 silent refresh.
 * 시드가 없으면 차단 로드. `useMessengerRoomClientPhase1` 의 네트워크 정책을 한 곳에 둔다.
 */
export function useMessengerRoomBootstrapLifecycle({
  roomId,
  initialServerSnapshot,
  refresh,
  loadedRef,
  setRoomReadyForRealtime,
}: Args): void {
  useEffect(() => {
    // Local-first / server-seeded 방은 Realtime 을 가능한 빨리 연다.
    // (초기 HTTP 부트스트랩 완료까지 기다리면 체감 진입이 느려진다.)
    setRoomReadyForRealtime(Boolean(initialServerSnapshot) || loadedRef.current);
    // 탭→방 컴포넌트 마운트 지연 측정(멈칫/라우팅 스케줄링 병목 확인)
    consumeCommunityMessengerRoomNavTap(roomId);
    if (initialServerSnapshot) {
      loadedRef.current = true;
      setRoomReadyForRealtime(true);
      /**
       * - `membersDeferred`: 멤버 전원 프로필 보강
       * - `bootstrapEnrichmentPending`: 경량 시드 — 통화·거래 도크·presence 등 풀 스냅샷으로 즉시 이어붙임
       */
      const needsImmediateRefresh =
        initialServerSnapshot.membersDeferred === true ||
        initialServerSnapshot.bootstrapEnrichmentPending === true;
      if (!needsImmediateRefresh) {
        return;
      }
      queueMicrotask(() => {
        void refresh(true);
      });
      return;
    }
    // 목록/로컬 스냅샷으로 first paint가 이미 가능하면, 첫 HTTP는 silent로 돌려 UI를 막지 않는다.
    void refresh(Boolean(loadedRef.current));
    // `initialServerSnapshot` 은 RSC 재실행마다 새 참조일 수 있어 deps 에 넣지 않음. 방 전환은 `roomId` 로 마운트 분리.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialServerSnapshot 의도적 제외(위 주석)
  }, [refresh, roomId, setRoomReadyForRealtime]);
}
