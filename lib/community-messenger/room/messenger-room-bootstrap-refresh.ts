import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  communityMessengerRoomBootstrapPath,
  parseCommunityMessengerRoomSnapshotResponse,
} from "@/lib/community-messenger/messenger-room-bootstrap";
import { messengerMonitorRoomLoad } from "@/lib/community-messenger/monitoring/client";
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

  async function refresh(silent = false): Promise<void> {
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
      const bootstrapQuery =
        silent && deferredMemberBootstrapRef.current ? "?memberHydration=minimal" : "";
      const flightKey = `cm-room-bootstrap:${roomId}:${bootstrapQuery || "default"}`;
      const { roomRes, snap } = await runSingleFlight(flightKey, async () => {
        const res = await fetch(`${communityMessengerRoomBootstrapPath(roomId)}${bootstrapQuery}`, {
          cache: "no-store",
        });
        const raw = await res.json().catch(() => null);
        return { roomRes: res, snap: parseCommunityMessengerRoomSnapshotResponse(raw) };
      });
      if (roomRes.ok && snap) {
        setSnapshot(snap);
        const elapsed =
          typeof performance !== "undefined" ? Math.round(performance.now() - tBoot) : Math.round(Date.now() - tBoot);
        messengerMonitorRoomLoad(roomId, elapsed);
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
