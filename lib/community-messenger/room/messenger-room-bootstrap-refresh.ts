import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  communityMessengerRoomBootstrapPath,
  parseCommunityMessengerRoomSnapshotResponse,
} from "@/lib/community-messenger/messenger-room-bootstrap";
import { messengerMonitorRoomLoad } from "@/lib/community-messenger/monitoring/client";
import { logClientPerf } from "@/lib/performance/samarket-perf";
import {
  recordRouteEntryMetric,
  recordRouteEntryElapsedMetric,
  recordRouteEntryFetchNetworkMs,
  recordRouteEntryFirstInteractive,
  recordRouteEntryJsonParseComplete,
  recordRouteEntryRouteTotalMs,
} from "@/lib/runtime/samarket-runtime-debug";
import { consumeRoomSnapshot } from "@/lib/community-messenger/room-snapshot-cache";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { forgetSingleFlight, runSingleFlight } from "@/lib/http/run-single-flight";
import { finishSilentRefreshRound, tryEnterSilentRefreshRound } from "@/lib/http/silent-refresh-coalesce";

export type MessengerRoomBootstrapRefreshDeps = {
  roomId: string;
  /** `snapshot.viewerUserId` — 클라 `runSingleFlight` 키에 포함해 계정·탭 간 부트스트랩 응답이 섞이지 않게 한다. */
  viewerBootstrapDedupRef: MutableRefObject<string>;
  setSnapshot: Dispatch<SetStateAction<CommunityMessengerRoomSnapshot | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setRoomReadyForRealtime: Dispatch<SetStateAction<boolean>>;
  loadedRef: MutableRefObject<boolean>;
  deferredMemberBootstrapRef: MutableRefObject<boolean>;
  silentRoomRefreshBusyRef: MutableRefObject<boolean>;
  silentRoomRefreshAgainRef: MutableRefObject<boolean>;
  /** `roomId` 전환 시 이전 클로저의 coalesce 타이머가 잘못된 방을 fetch 하지 않도록 훅에서 안정적으로 넘긴다. */
  silentBootstrapThrottleCoalesceTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
};

/** 메시지 전송 직후 in-flight 부트스트랩 Promise 가 옛 결과를 재사용하지 않도록 비운다. */
export function forgetMessengerRoomClientBootstrapFlights(opts: { roomId: string; viewerUserId: string }): void {
  const rid = opts.roomId.trim();
  const uid = opts.viewerUserId.trim();
  if (!rid || !uid) return;
  forgetSingleFlight(`cm-room-bootstrap:${uid}:${rid}:default`);
  forgetSingleFlight(`cm-room-bootstrap:${uid}:${rid}:?mode=lite&memberHydration=minimal`);
}

/**
 * 메신저 방 HTTP 부트스트랩 갱신 — `CommunityMessengerRoomClient` 와 동일 동작(프라임·rAF·single-flight).
 * 컴포넌트 밖 두어 리렌더마다 콜백 본문 재생성 범위를 줄인다.
 */
export function createMessengerRoomBootstrapRefresh(
  deps: MessengerRoomBootstrapRefreshDeps
): (silent?: boolean) => Promise<void> {
  /** 시드 직후 동일 silent·동일 flightKey 가 연속으로 겹칠 때(againRef 등) 짧은 창에서 한 번만 네트워크를 연다. */
  const silentSameKeyCoalesceRef = { key: "", at: 0 };
  const {
    roomId,
    viewerBootstrapDedupRef,
    setSnapshot,
    setLoading,
    setRoomReadyForRealtime,
    loadedRef,
    deferredMemberBootstrapRef,
    silentRoomRefreshBusyRef,
    silentRoomRefreshAgainRef,
    silentBootstrapThrottleCoalesceTimerRef,
  } = deps;

  /** 사일런트 GET 폭주(visibility/pageshow/realtime 버스트) 완화 */
  let lastSilentRefreshAt = 0;
  /** 429(Retry-After) 시 즉시 재시도 폭주 방지 */
  let silentBackoffUntil = 0;
  /**
   * `lastSilentRefreshAt` 420ms 창 안에 들어온 사일런트 요청은 **버리지 않고** 한 번만 뒤로 미룬다.
   * (통화 종료·call_stub·cm.room.bump 가 같은 틱에 겹치면 이전 구현은 후속 refresh 가 영구 유실될 수 있음)
   */
  const coalesceTimerRef = silentBootstrapThrottleCoalesceTimerRef;

  async function refresh(silent = false): Promise<void> {
    if (silent) {
      const now = Date.now();
      if (now < silentBackoffUntil) return;
      if (now - lastSilentRefreshAt < 420) {
        if (coalesceTimerRef.current != null) clearTimeout(coalesceTimerRef.current);
        coalesceTimerRef.current = setTimeout(() => {
          coalesceTimerRef.current = null;
          void refresh(true);
        }, Math.max(1, 420 - (Date.now() - lastSilentRefreshAt)));
        return;
      }
      if (coalesceTimerRef.current != null) {
        clearTimeout(coalesceTimerRef.current);
        coalesceTimerRef.current = null;
      }
      lastSilentRefreshAt = now;
    }
    if (!tryEnterSilentRefreshRound(silent, silentRoomRefreshBusyRef, silentRoomRefreshAgainRef)) {
      return;
    }
    const primed =
      !silent &&
      consumeRoomSnapshot(
        roomId,
        viewerBootstrapDedupRef.current.trim() ? viewerBootstrapDedupRef.current.trim() : null
      );
    const shouldBlock = !silent && !loadedRef.current && !primed;
    /** consumeRoomSnapshot 시드 직후에도 이어지는 `room_client` GET — `shouldBlock` perf 와 분리 */
    const isPrimedFollowupRoomClient = !silent && primed;
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
       * 첫 차단 로드는 seed(`lite`)만, 이후 보강은 minimal members를 유지한 채 background로 붙인다.
       * - blocking first load: seed + secondary defer
       * - silent refresh after seed: minimal members + secondary enabled
       */
      const wantSeed = !silent && !loadedRef.current && !primed;
      const wantMinimalMembers = wantSeed || deferredMemberBootstrapRef.current;
      const bootstrapQuery = wantSeed
        ? "?mode=lite&memberHydration=minimal"
        : wantMinimalMembers
          ? "?memberHydration=minimal"
          : "";
      /** 계측: silent / 차단 시드 / 프라임 직후 보강 — 네트워크 URL(`cmReqSrc`)만으로 구분 */
      const reqSrc = silent
        ? "room_silent"
        : shouldBlock
          ? "room_client_block"
          : primed
            ? "room_client_primed_followup"
            : "room_client_legacy";
      const bootstrapQueryWithSrc = bootstrapQuery
        ? `${bootstrapQuery}&cmReqSrc=${reqSrc}`
        : `?cmReqSrc=${reqSrc}`;
      const viewer = viewerBootstrapDedupRef.current.trim() || "anon";
      const flightKey = `cm-room-bootstrap:${viewer}:${roomId}:${bootstrapQuery || "default"}`;
      if (silent && loadedRef.current) {
        const now = Date.now();
        if (
          silentSameKeyCoalesceRef.key === flightKey &&
          now - silentSameKeyCoalesceRef.at < 220
        ) {
          finishSilentRefreshRound(true, silentRoomRefreshBusyRef, silentRoomRefreshAgainRef, () => {});
          return;
        }
        silentSameKeyCoalesceRef.key = flightKey;
        silentSameKeyCoalesceRef.at = now;
      }
      const { roomRes, snap } = await runSingleFlight(flightKey, async () => {
        const tFetch = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (shouldBlock) {
          recordRouteEntryElapsedMetric("messenger_room_entry", "room_bootstrap_request_start_ms");
        }
        if (isPrimedFollowupRoomClient) {
          recordRouteEntryElapsedMetric("messenger_room_entry", "room_bootstrap_primed_followup_request_start_ms");
        }
        const res = await fetch(`${communityMessengerRoomBootstrapPath(roomId)}${bootstrapQueryWithSrc}`, {
          cache: "no-store",
        });
        const fetchElapsed =
          typeof performance !== "undefined" ? Math.round(performance.now() - tFetch) : Math.round(Date.now() - tFetch);
        if (shouldBlock) {
          recordRouteEntryElapsedMetric("messenger_room_entry", "room_bootstrap_response_end_ms");
        }
        if (isPrimedFollowupRoomClient) {
          recordRouteEntryElapsedMetric("messenger_room_entry", "room_bootstrap_primed_followup_response_end_ms");
        }
        recordRouteEntryFetchNetworkMs("messenger_room_entry", fetchElapsed);
        recordRouteEntryRouteTotalMs(
          "messenger_room_entry",
          Number(res.headers.get("x-samarket-route-total-ms") ?? "")
        );
        recordRouteEntryMetric(
          "messenger_room_entry",
          "response_size_bytes",
          Number(res.headers.get("x-samarket-response-size-bytes") ?? "")
        );
        recordRouteEntryMetric(
          "messenger_room_entry",
          "room_bootstrap_fetch_ms",
          Number(res.headers.get("x-samarket-room-bootstrap-fetch-ms") ?? "")
        );
        recordRouteEntryMetric(
          "messenger_room_entry",
          "messages_fetch_ms",
          Number(res.headers.get("x-samarket-messages-fetch-ms") ?? "")
        );
        recordRouteEntryMetric(
          "messenger_room_entry",
          "participants_profiles_fetch_ms",
          Number(res.headers.get("x-samarket-participants-profiles-fetch-ms") ?? "")
        );
        recordRouteEntryMetric(
          "messenger_room_entry",
          "normalize_merge_ms",
          Number(res.headers.get("x-samarket-normalize-merge-ms") ?? "")
        );
        if (res.status === 429) {
          const ra = res.headers.get("Retry-After");
          const sec = Math.min(120, Math.max(1, Number.parseInt(ra ?? "", 10) || 5));
          silentBackoffUntil = Date.now() + sec * 1000;
        }
        const raw = await res.json().catch(() => null);
        if (shouldBlock) {
          recordRouteEntryElapsedMetric("messenger_room_entry", "room_bootstrap_json_parse_complete_ms");
          recordRouteEntryJsonParseComplete("messenger_room_entry");
        }
        if (isPrimedFollowupRoomClient) {
          recordRouteEntryElapsedMetric("messenger_room_entry", "room_bootstrap_primed_followup_json_parse_complete_ms");
        }
        return { roomRes: res, snap: parseCommunityMessengerRoomSnapshotResponse(raw) };
      });
      if (roomRes.ok && snap) {
        setSnapshot(snap);
        if (wantMinimalMembers) {
          // minimal members 로 시작했으면 멤버 전원 로드는 members sheet에서만.
          deferredMemberBootstrapRef.current = true;
        }
        const elapsed =
          typeof performance !== "undefined" ? Math.round(performance.now() - tBoot) : Math.round(Date.now() - tBoot);
        messengerMonitorRoomLoad(roomId, elapsed, { silent, cmReqSrc: reqSrc });
        if (shouldBlock) {
          const suf = roomId.trim();
          logClientPerf("messenger-room.enter", {
            phase: "bootstrap_fetch",
            blocking: true,
            silent,
            cmReqSrc: reqSrc,
            mode: wantSeed ? "lite" : wantMinimalMembers ? "minimal-members" : "default",
            ms: elapsed,
            roomIdSuffix: suf.length <= 8 ? suf : suf.slice(-8),
          });
        }
      } else if (!primed && !silent) {
        // 사일런트 갱신 실패 시 스냅샷을 비우면 Realtime·목록이 끊긴다(`primed` 는 silent 에서 항상 false).
        setSnapshot(null);
      }
    } finally {
      setRoomReadyForRealtime(true);
      recordRouteEntryFirstInteractive("messenger_room_entry");
      finishSilentRefreshRound(silent, silentRoomRefreshBusyRef, silentRoomRefreshAgainRef, () => {
        void refresh(true);
      });
      loadedRef.current = true;
      if (shouldBlock) setLoading(false);
    }
  }

  return refresh;
}
