import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  communityMessengerRoomBootstrapPath,
  parseCommunityMessengerRoomSnapshotResponse,
} from "@/lib/community-messenger/messenger-room-bootstrap";
import { messengerMonitorRoomLoad } from "@/lib/community-messenger/monitoring/client";
import { logClientPerf } from "@/lib/performance/samarket-perf";
import { consumeRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { finishSilentRefreshRound, tryEnterSilentRefreshRound } from "@/lib/http/silent-refresh-coalesce";

export type MessengerRoomBootstrapRefreshDeps = {
  roomId: string;
  setSnapshot: Dispatch<SetStateAction<CommunityMessengerRoomSnapshot | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setRoomReadyForRealtime: Dispatch<SetStateAction<boolean>>;
  loadedRef: MutableRefObject<boolean>;
  deferredMemberBootstrapRef: MutableRefObject<boolean>;
  silentRoomRefreshBusyRef: MutableRefObject<boolean>;
  silentRoomRefreshAgainRef: MutableRefObject<boolean>;
};

/**
 * 메신저 방 HTTP 부트스트랩 갱신 — `CommunityMessengerRoomClient` 와 동일 동작(프라임·rAF·single-flight).
 * 컴포넌트 밖 두어 리렌더마다 콜백 본문 재생성 범위를 줄인다.
 */
export function createMessengerRoomBootstrapRefresh(
  deps: MessengerRoomBootstrapRefreshDeps
): (silent?: boolean) => Promise<void> {
  const {
    roomId,
    setSnapshot,
    setLoading,
    setRoomReadyForRealtime,
    loadedRef,
    deferredMemberBootstrapRef,
    silentRoomRefreshBusyRef,
    silentRoomRefreshAgainRef,
  } = deps;

  /** 사일런트 GET 폭주(visibility/pageshow/realtime 버스트) 완화 */
  let lastSilentRefreshAt = 0;
  /** 429(Retry-After) 시 즉시 재시도 폭주 방지 */
  let silentBackoffUntil = 0;

  async function refresh(silent = false): Promise<void> {
    if (silent) {
      const now = Date.now();
      if (now < silentBackoffUntil) return;
      if (now - lastSilentRefreshAt < 420) return;
      lastSilentRefreshAt = now;
    }
    if (!tryEnterSilentRefreshRound(silent, silentRoomRefreshBusyRef, silentRoomRefreshAgainRef)) {
      return;
    }
    const primed = !silent && consumeRoomSnapshot(roomId);
    const shouldBlock = !silent && !loadedRef.current && !primed;
    if (shouldBlock) setLoading(true);
    try {
      if (primed) {
        setSnapshot(primed);
        setLoading(false);
        await new Promise<void>((resolve) => {
          if (typeof requestAnimationFrame === "undefined") {
            queueMicrotask(() => resolve());
          } else {
            requestAnimationFrame(() => resolve());
          }
        });
      }
      const tBoot = typeof performance !== "undefined" ? performance.now() : Date.now();
      /**
       * 첫 진입(차단 로드) 성능이 핵심이라 기본은 `minimal` 로 간다.
       * - 목록/프리패치 스냅샷이 있으면 이미 첫 페인트는 가능
       * - 이후 멤버 시트 진입 시에만 `/members` 로 페이징 로드(기존 정책 유지)
       * - 사일런트 갱신도 `membersDeferred`(minimal) 상태면 계속 minimal 유지
       */
      const wantMinimal = (!silent && !loadedRef.current && !primed) || (silent && deferredMemberBootstrapRef.current);
      const bootstrapQuery = wantMinimal ? "?mode=lite&memberHydration=minimal" : "";
      const flightKey = `cm-room-bootstrap:${roomId}:${bootstrapQuery || "default"}`;
      const { roomRes, snap } = await runSingleFlight(flightKey, async () => {
        const res = await fetch(`${communityMessengerRoomBootstrapPath(roomId)}${bootstrapQuery}`, {
          cache: "no-store",
        });
        if (res.status === 429) {
          const ra = res.headers.get("Retry-After");
          const sec = Math.min(120, Math.max(1, Number.parseInt(ra ?? "", 10) || 5));
          silentBackoffUntil = Date.now() + sec * 1000;
        }
        const raw = await res.json().catch(() => null);
        return { roomRes: res, snap: parseCommunityMessengerRoomSnapshotResponse(raw) };
      });
      if (roomRes.ok && snap) {
        setSnapshot(snap);
        if (wantMinimal) {
          // minimal 로 시작했으면 이후 사일런트 갱신도 minimal 유지(멤버 전원 로드는 members sheet에서만).
          deferredMemberBootstrapRef.current = true;
        }
        const elapsed =
          typeof performance !== "undefined" ? Math.round(performance.now() - tBoot) : Math.round(Date.now() - tBoot);
        messengerMonitorRoomLoad(roomId, elapsed);
        if (shouldBlock) {
          const suf = roomId.trim();
          logClientPerf("messenger-room.enter", {
            phase: "bootstrap_fetch",
            blocking: true,
            silent,
            mode: wantMinimal ? "lite" : "default",
            ms: elapsed,
            roomIdSuffix: suf.length <= 8 ? suf : suf.slice(-8),
          });
        }
      } else if (!primed) {
        setSnapshot(null);
      }
    } finally {
      setRoomReadyForRealtime(true);
      finishSilentRefreshRound(silent, silentRoomRefreshBusyRef, silentRoomRefreshAgainRef, () => {
        void refresh(true);
      });
      loadedRef.current = true;
      if (shouldBlock) setLoading(false);
    }
  }

  return refresh;
}
