"use client";

import { useEffect, type MutableRefObject } from "react";
import { peekRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { consumeCommunityMessengerRoomNavTap } from "@/lib/community-messenger/room-nav-timing";
import { cancelScheduledWhenBrowserIdle, scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";

type Args = {
  roomId: string;
  initialServerSnapshot: CommunityMessengerRoomSnapshot | null | undefined;
  refresh: (silent?: boolean) => Promise<void>;
  loadedRef: MutableRefObject<boolean>;
  setRoomReadyForRealtime: (open: boolean) => void;
};

/**
 * 방 페이지: 시드 스냅샷(hot/peek/RSC)이 있으면 첫 페인트는 시드로 유지하고, 보강이 필요하면 **idle 이후 1회** silent refresh.
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
    const viewerGuess = initialServerSnapshot?.viewerUserId?.trim() ?? "";
    const warmFromCache = peekRoomSnapshot(roomId, viewerGuess || undefined) ?? null;
    const warmSnapshot = initialServerSnapshot ?? warmFromCache;
    setRoomReadyForRealtime(Boolean(warmSnapshot) || loadedRef.current);
    // 탭→방 컴포넌트 마운트 지연 측정(멈칫/라우팅 스케줄링 병목 확인)
    consumeCommunityMessengerRoomNavTap(roomId);
    if (initialServerSnapshot) {
      loadedRef.current = true;
      setRoomReadyForRealtime(true);
      /**
       * - `membersDeferred`: 멤버 전원 프로필 보강
       * - `bootstrapEnrichmentPending`: 경량 시드 — 통화·거래 도크·presence 등 풀 스냅샷으로 이어붙임
       * mount 직후 `queueMicrotask(refresh)` 는 동일 `GET .../bootstrap` 을 서버 시드와 겹쳐 연다 — **idle 1회**로만 연다.
       */
      const needsDeferredEnrichment =
        initialServerSnapshot.membersDeferred === true ||
        initialServerSnapshot.bootstrapEnrichmentPending === true;
      if (!needsDeferredEnrichment) {
        return;
      }
      /** `bootstrapEnrichmentPending`: 거래 상세 등 시드 보강 — idle 2s 보다 먼저 한 프레임 뒤 silent GET 으로 카드 합류 */
      if (initialServerSnapshot.bootstrapEnrichmentPending === true) {
        let raf1 = 0;
        let raf2 = 0;
        raf1 = requestAnimationFrame(() => {
          raf2 = requestAnimationFrame(() => {
            void refresh(true);
          });
        });
        return () => {
          if (raf1 !== 0) cancelAnimationFrame(raf1);
          if (raf2 !== 0) cancelAnimationFrame(raf2);
        };
      }
      const idleId = scheduleWhenBrowserIdle(() => {
        void refresh(true);
      }, 2000);
      return () => {
        cancelScheduledWhenBrowserIdle(idleId);
      };
    }
    /**
     * 시드 없는 진입: `useMessengerRoomLocalIndexedDbSnapshot` 이 같은 틱에 `loadedRef` 를 올리기 전에
     * 동기 `refresh(false)` 가 먼저 열리면 차단 부트스트랩 GET 이 textarea 페인트보다 앞서 나간다.
     * 한 프레임 뒤에 호출해 로컬 시드·peek 반영 후에는 `refresh(true)` 로 합류되게 한다.
     */
    let raf = 0;
    raf = requestAnimationFrame(() => {
      raf = 0;
      void refresh(Boolean(loadedRef.current));
    });
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf);
    };
    // `initialServerSnapshot` 은 RSC 재실행마다 새 참조일 수 있어 deps 에 넣지 않음. 방 전환은 `roomId` 로 마운트 분리.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialServerSnapshot 의도적 제외(위 주석)
  }, [refresh, roomId, setRoomReadyForRealtime]);
}
