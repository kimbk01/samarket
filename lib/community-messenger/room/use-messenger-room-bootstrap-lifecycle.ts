"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import {
  isRoomSnapshotFreshWithin,
  peekRoomSnapshot,
} from "@/lib/community-messenger/room-snapshot-cache";
import {
  CM_FOREGROUND_BOOTSTRAP_REUSE_MS,
  hasCmRoomNetworkBootstrapSucceededSince,
  markCmRoomForegroundReuseEntry,
} from "@/lib/community-messenger/room/cm-room-bootstrap-lock";
import { isMessengerRoomBootstrapReadySnapshot } from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";
import { isMessengerRoomTimelineBootstrapSeedComplete } from "@/lib/community-messenger/room/messenger-room-timeline-hydration";
import {
  isCommunityMessengerGroupRoomType,
  type CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";
import { cmStrictEffectRunProbe } from "@/lib/community-messenger/room/cm-bootstrap-scheduling";

export type MessengerRoomBootstrapRefreshFn = (
  silent?: boolean,
  opts?: { forceSilentNetwork?: boolean; triggerReason?: string; forceForegroundBlock?: boolean }
) => Promise<void>;

/**
 * 그룹 결함 D3 (docs/design/group-chat-audit-design-2026-11-13.md): 캐시·목록 값으로 그려진 그룹 방 진입은
 * 방 사진·제목을 서버에서 다시 받지 않아 다른 멤버가 바꾼 사진이 머리글에 안 나온다.
 * 진입 후 이 시간까지 네트워크 부트스트랩 응답이 한 번도 없으면 `silent_delta` 를 1회 받는다.
 * 기존 보강 GET 밴드(`roomBootstrapSecondaryEnrichmentDelayMs` 300~500ms) 가 끝난 뒤라 그 요청이 있으면 먼저 반영되고,
 * 첫 페인트·메시지 요청을 막지 않는다.
 */
export const CM_ROOM_ENTRY_GROUP_IDENTITY_CHECK_DELAY_MS = 600;

type Args = {
  roomId: string;
  initialServerSnapshot: CommunityMessengerRoomSnapshot | null | undefined;
  refresh: MessengerRoomBootstrapRefreshFn;
  loadedRef: MutableRefObject<boolean>;
  setRoomReadyForRealtime: (open: boolean) => void;
};

/**
 * 방 페이지: 시드 스냅샷(hot/peek/RSC)이 있으면 첫 페인트는 시드로 유지하고, 보강이 필요하면 silent refresh(멤버 지연은 즉시, trade/full 보강만 100~300ms).
 * `clientShellPlaceholder` 셸만 있으면 차단 부트스트랩을 **즉시** 호출한다. `useMessengerRoomClientPhase1` 의 네트워크 정책을 한 곳에 둔다.
 */
export function useMessengerRoomBootstrapLifecycle({
  roomId,
  initialServerSnapshot,
  refresh,
  loadedRef,
  setRoomReadyForRealtime,
}: Args): void {
  /** 진입 첫 패스가 끝나면 `refresh` 참조가 바뀐다 — 진입 1회 확인은 `roomId` 에만 묶고 최신 refresh 를 ref 로 부른다 */
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (typeof window === "undefined" || isDevSafeMode()) return;
    const viewerGuess = initialServerSnapshot?.viewerUserId?.trim() ?? "";
    const seed = initialServerSnapshot ?? peekRoomSnapshot(roomId, viewerGuess || undefined) ?? null;
    const roomType = seed?.room?.roomType;
    if (!roomType || !isCommunityMessengerGroupRoomType(roomType)) return;
    const enteredAt = Date.now();
    const t = window.setTimeout(() => {
      if (hasCmRoomNetworkBootstrapSucceededSince(roomId, enteredAt)) return;
      void refreshRef.current(true, { triggerReason: "entry_group_identity", forceSilentNetwork: true });
    }, CM_ROOM_ENTRY_GROUP_IDENTITY_CHECK_DELAY_MS);
    return () => clearTimeout(t);
    // `initialServerSnapshot` 은 아래 효과와 같은 이유로 deps 제외 — 방 전환은 `roomId` 로 구분.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialServerSnapshot 의도적 제외
  }, [roomId]);

  useEffect(() => {
    cmStrictEffectRunProbe("useMessengerRoomBootstrapLifecycle", roomId);
    const viewerGuess = initialServerSnapshot?.viewerUserId?.trim() ?? "";
    const warmFromCache = peekRoomSnapshot(roomId, viewerGuess || undefined) ?? null;
    const seededSnapshot = isMessengerRoomBootstrapReadySnapshot(initialServerSnapshot)
      ? initialServerSnapshot
      : null;
    const warmSnapshot =
      seededSnapshot ??
      (isMessengerRoomBootstrapReadySnapshot(warmFromCache) ? warmFromCache : null);

    setRoomReadyForRealtime(Boolean(warmSnapshot) || loadedRef.current);

    if (seededSnapshot) {
      loadedRef.current = true;
      setRoomReadyForRealtime(true);
      if (!isMessengerRoomTimelineBootstrapSeedComplete(seededSnapshot)) {
        void refresh(false, {
          triggerReason: "lifecycle_incomplete_timeline_seed",
          forceForegroundBlock: true,
        });
        return;
      }
      /**
       * D-12 ③ (실기기 04:38 logpoint 확인): 재진입은 이 분기에서 네트워크 없이 준비된다 —
       * 방 밖에 있던 동안의 상대 읽음을 1회 확인하도록 캐시 재사용 진입으로 표시.
       */
      markCmRoomForegroundReuseEntry(roomId);
      /**
       * - `membersDeferred`: 멤버 전원 프로필 보강 — 즉시 silent(동일 틱, runSingleFlight·coalesce로 중복 완화)
       * - `bootstrapEnrichmentPending`: full 보강 — 100~300ms 뒤 1회 silent
       */
      const needsDeferredEnrichment =
        seededSnapshot.membersDeferred === true ||
        seededSnapshot.bootstrapEnrichmentPending === true;
      if (!needsDeferredEnrichment) {
        return;
      }
      if (seededSnapshot.membersDeferred === true && !isDevSafeMode()) {
        void refresh(true, { triggerReason: "members_deferred" });
      }
      if (seededSnapshot.bootstrapEnrichmentPending === true) {
        if (isDevSafeMode()) {
          return;
        }
        const delayMs = 100 + Math.floor(Math.random() * 101);
        const t =
          typeof window !== "undefined"
            ? window.setTimeout(() => {
                void refresh(true, { triggerReason: "bootstrap_enrichment_pending" });
              }, delayMs)
            : 0;
        return () => {
          if (t !== 0) clearTimeout(t);
        };
      }
      if (seededSnapshot.membersDeferred === true) {
        if (!isDevSafeMode()) {
          /** silent_delta 멤버 보강 뒤 activeCall·trade full enrich — 통화 배너·수신 UI 지연 완화 */
          const enrichDelayMs = 160 + Math.floor(Math.random() * 81);
          const enrichTimer =
            typeof window !== "undefined"
              ? window.setTimeout(() => {
                  void refresh(true, {
                    triggerReason: "bootstrap_enrichment_pending",
                    forceSilentNetwork: true,
                  });
                }, enrichDelayMs)
              : 0;
          return () => {
            if (enrichTimer !== 0) clearTimeout(enrichTimer);
          };
        }
      }
      return;
    }

    const cacheFresh =
      Boolean(warmSnapshot) &&
      isRoomSnapshotFreshWithin(roomId, CM_FOREGROUND_BOOTSTRAP_REUSE_MS, viewerGuess || null);
    /** placeholder 셸: HTTP bootstrap 과 병렬로 Realtime 을 먼저 연다 */
    setRoomReadyForRealtime(true);
    /** placeholder 셸·캐시 미스: blocking fetch. 재진입(5s 캐시)만 foreground block 생략 */
    void refresh(false, {
      triggerReason: cacheFresh ? "lifecycle_reentry" : "lifecycle_blocking_first",
      forceForegroundBlock: !cacheFresh,
    });
    // `initialServerSnapshot` 은 RSC 재실행마다 새 참조일 수 있어 deps 에 넣지 않음. 방 전환은 `roomId` 로 마운트 분리.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialServerSnapshot 의도적 제외(위 주석)
  }, [refresh, roomId, setRoomReadyForRealtime]);
}
