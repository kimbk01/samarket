"use client";

import { useEffect, type MutableRefObject } from "react";
import {
  isRoomSnapshotFreshWithin,
  peekRoomSnapshot,
} from "@/lib/community-messenger/room-snapshot-cache";
import { CM_FOREGROUND_BOOTSTRAP_REUSE_MS } from "@/lib/community-messenger/room/cm-room-bootstrap-lock";
import { isMessengerRoomBootstrapReadySnapshot } from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";
import { isMessengerRoomTimelineBootstrapSeedComplete } from "@/lib/community-messenger/room/messenger-room-timeline-hydration";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";
import { cmStrictEffectRunProbe } from "@/lib/community-messenger/room/cm-bootstrap-scheduling";

export type MessengerRoomBootstrapRefreshFn = (
  silent?: boolean,
  opts?: { forceSilentNetwork?: boolean; triggerReason?: string; forceForegroundBlock?: boolean }
) => Promise<void>;

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
