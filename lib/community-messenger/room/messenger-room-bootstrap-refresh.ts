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
import { cmCallIncomingTraceMaybeRoomBootstrap } from "@/lib/community-messenger/cm-call-debug";

const BOOTSTRAP_FETCH_BREAKDOWN =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE_BOOTSTRAP_BREAKDOWN === "1";

/** stale-while-revalidate: 소비된 목록 캐시로 페인트한 뒤 네트워크 재검증(2~5s 지터) */
const ROOM_BOOTSTRAP_SWR_DELAY_MS_MIN = 2000;
const ROOM_BOOTSTRAP_SWR_DELAY_MS_MAX = 5000;

function roomBootstrapSwrDelayMs(): number {
  return (
    ROOM_BOOTSTRAP_SWR_DELAY_MS_MIN +
    Math.floor(Math.random() * (ROOM_BOOTSTRAP_SWR_DELAY_MS_MAX - ROOM_BOOTSTRAP_SWR_DELAY_MS_MIN + 1))
  );
}

function payloadSizeTierKb(sizeBytes: number): { kb: number; tier: "ok" | "review" | "problem" } {
  const kb = Math.round((sizeBytes / 1024) * 10) / 10;
  if (sizeBytes >= 100 * 1024) return { kb, tier: "problem" };
  if (sizeBytes >= 50 * 1024) return { kb, tier: "review" };
  return { kb, tier: "ok" };
}

function logBootstrapFetchBreakdownTable(payload: Record<string, string | number | undefined>): void {
  if (!BOOTSTRAP_FETCH_BREAKDOWN || typeof console === "undefined") return;
  const rows = Object.entries(payload)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([step, ms]) => ({ step, ms: typeof ms === "number" ? Math.round(ms) : ms }));
  console.info("[bootstrap_fetch:breakdown] rows", rows);
  if (typeof console.table === "function") {
    console.table(rows);
  }
}

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
  /** `consumeRoomSnapshot` 즉시 렌더 후 지연 SWR 부트스트랩 타이머 — 언마운트·재진입 시 클리어 */
  swrDeferredBootstrapTimerRef: MutableRefObject<number | null>;
};

/** 메시지 전송 직후 in-flight 부트스트랩 Promise 가 옛 결과를 재사용하지 않도록 비운다. */
export function forgetMessengerRoomClientBootstrapFlights(opts: { roomId: string; viewerUserId: string }): void {
  const rid = opts.roomId.trim();
  const uid = opts.viewerUserId.trim();
  if (!rid || !uid) return;
  forgetSingleFlight(`cm-room-bootstrap:${uid}:${rid}:default`);
  forgetSingleFlight(`cm-room-bootstrap:${uid}:${rid}:?mode=lite&memberHydration=minimal`);
  forgetSingleFlight(`cm-room-bootstrap:${uid}:${rid}:?mode=instant&memberHydration=minimal`);
}

/**
 * 메신저 방 HTTP 부트스트랩 갱신 — `CommunityMessengerRoomClient` 와 동일 동작(프라임·rAF·single-flight).
 * 컴포넌트 밖 두어 리렌더마다 콜백 본문 재생성 범위를 줄인다.
 */
export function createMessengerRoomBootstrapRefresh(
  deps: MessengerRoomBootstrapRefreshDeps
): (silent?: boolean, opts?: { forceSilentNetwork?: boolean }) => Promise<void> {
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
    swrDeferredBootstrapTimerRef,
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

  async function refresh(
    silent = false,
    opts?: { /** 상대 읽음 커서 등 — 220ms 동일 키 스킵 없이 반드시 네트워크 */ forceSilentNetwork?: boolean }
  ): Promise<void> {
    if (silent) {
      const now = Date.now();
      if (now < silentBackoffUntil) return;
      if (!opts?.forceSilentNetwork && now - lastSilentRefreshAt < 420) {
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
    if (!silent && swrDeferredBootstrapTimerRef.current) {
      clearTimeout(swrDeferredBootstrapTimerRef.current);
      swrDeferredBootstrapTimerRef.current = null;
    }
    const primed =
      !silent &&
      consumeRoomSnapshot(
        roomId,
        viewerBootstrapDedupRef.current.trim() ? viewerBootstrapDedupRef.current.trim() : null
      );
    const shouldBlock = !silent && !loadedRef.current && !primed;
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
        const delayMs = roomBootstrapSwrDelayMs();
        if (typeof window !== "undefined") {
          swrDeferredBootstrapTimerRef.current = window.setTimeout(() => {
            swrDeferredBootstrapTimerRef.current = null;
            void refresh(true, { forceSilentNetwork: true });
          }, delayMs);
        } else {
          void refresh(true, { forceSilentNetwork: true });
        }
      } else {
      const tBoot = typeof performance !== "undefined" ? performance.now() : Date.now();
      /**
       * 첫 차단 로드는 seed(`lite`)만, 이후 보강은 minimal members를 유지한 채 background로 붙인다.
       * - blocking first load: seed + secondary defer
       * - silent refresh after seed: minimal members + secondary enabled
       */
      const wantSeed = !silent && !loadedRef.current;
      const wantMinimalMembers = wantSeed || deferredMemberBootstrapRef.current;
      const bootstrapQuery = wantSeed
        ? "?mode=instant&memberHydration=minimal"
        : wantMinimalMembers
          ? "?memberHydration=minimal"
          : "";
      /** 계측: silent / 차단 시드 / 네트워크 URL(`cmReqSrc`)만으로 구분 */
      const reqSrc = silent
        ? "room_silent"
        : shouldBlock
          ? "room_client_block"
          : "room_client_legacy";
      const bootstrapQueryWithSrc = bootstrapQuery
        ? `${bootstrapQuery}&cmReqSrc=${reqSrc}`
        : `?cmReqSrc=${reqSrc}`;
      const viewer = viewerBootstrapDedupRef.current.trim() || "anon";
      const flightKey = `cm-room-bootstrap:${viewer}:${roomId}:${bootstrapQuery || "default"}`;
      if (silent && loadedRef.current && !opts?.forceSilentNetwork) {
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
      if (silent && loadedRef.current && opts?.forceSilentNetwork) {
        silentSameKeyCoalesceRef.key = "";
        silentSameKeyCoalesceRef.at = 0;
      }
      const flightResult = await runSingleFlight(flightKey, async () => {
        const tFetch = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (shouldBlock) {
          recordRouteEntryElapsedMetric("messenger_room_entry", "room_bootstrap_request_start_ms");
        }
        cmCallIncomingTraceMaybeRoomBootstrap(roomId, "start");
        const res = await fetch(`${communityMessengerRoomBootstrapPath(roomId)}${bootstrapQueryWithSrc}`, {
          cache: "default",
          credentials: "include",
        });
        const tAfterHeaders = typeof performance !== "undefined" ? performance.now() : Date.now();
        const fetchToHeadersMs =
          typeof performance !== "undefined" ? tAfterHeaders - tFetch : Date.now() - (tFetch as number);
        const bodyText = await res.text();
        const tAfterBody = typeof performance !== "undefined" ? performance.now() : Date.now();
        const responseBodyReadMs =
          typeof performance !== "undefined" ? tAfterBody - tAfterHeaders : Date.now() - (tAfterHeaders as number);
        const clientWireMs = fetchToHeadersMs + responseBodyReadMs;
        const fetchElapsed = Math.round(clientWireMs);
        if (shouldBlock) {
          recordRouteEntryElapsedMetric("messenger_room_entry", "room_bootstrap_response_end_ms");
        }
        recordRouteEntryFetchNetworkMs("messenger_room_entry", fetchElapsed);
        const serverRouteTotal = Number(res.headers.get("x-samarket-route-total-ms") ?? "");
        const serverSnapshotMs = Number(res.headers.get("x-samarket-room-bootstrap-fetch-ms") ?? "");
        const sizeBytes = Number(res.headers.get("x-samarket-response-size-bytes") ?? "");
        recordRouteEntryRouteTotalMs("messenger_room_entry", serverRouteTotal);
        recordRouteEntryMetric("messenger_room_entry", "response_size_bytes", sizeBytes);
        recordRouteEntryMetric("messenger_room_entry", "room_bootstrap_fetch_ms", serverSnapshotMs);
        recordRouteEntryMetric("messenger_room_entry", "messages_fetch_ms", Number(res.headers.get("x-samarket-messages-fetch-ms") ?? ""));
        recordRouteEntryMetric(
          "messenger_room_entry",
          "participants_profiles_fetch_ms",
          Number(res.headers.get("x-samarket-participants-profiles-fetch-ms") ?? "")
        );
        recordRouteEntryMetric("messenger_room_entry", "normalize_merge_ms", Number(res.headers.get("x-samarket-normalize-merge-ms") ?? ""));
        if (res.status === 429) {
          const ra = res.headers.get("Retry-After");
          const sec = Math.min(120, Math.max(1, Number.parseInt(ra ?? "", 10) || 5));
          silentBackoffUntil = Date.now() + sec * 1000;
        }
        const tJson0 = typeof performance !== "undefined" ? performance.now() : Date.now();
        let raw: unknown = null;
        try {
          raw = JSON.parse(bodyText) as unknown;
        } catch {
          raw = null;
        }
        const tAfterJson = typeof performance !== "undefined" ? performance.now() : Date.now();
        const jsonParseMsNum =
          typeof performance !== "undefined" ? Math.round(tAfterJson - tJson0) : Math.round(Date.now() - (tJson0 as number));
        const tSnap0 = typeof performance !== "undefined" ? performance.now() : Date.now();
        const snap = parseCommunityMessengerRoomSnapshotResponse(raw);
        const snapshotParseMsNum =
          typeof performance !== "undefined" ? Math.round(performance.now() - tSnap0) : Math.round(Date.now() - (tSnap0 as number));
        cmCallIncomingTraceMaybeRoomBootstrap(roomId, "done");
        if (shouldBlock) {
          recordRouteEntryElapsedMetric("messenger_room_entry", "room_bootstrap_json_parse_complete_ms");
          recordRouteEntryJsonParseComplete("messenger_room_entry");
        }
        const clientInnerSumMs =
          Math.round(fetchToHeadersMs) + Math.round(responseBodyReadMs) + jsonParseMsNum + snapshotParseMsNum;
        if (BOOTSTRAP_FETCH_BREAKDOWN) {
          const { kb, tier } = Number.isFinite(sizeBytes) && sizeBytes > 0 ? payloadSizeTierKb(sizeBytes) : { kb: 0, tier: "ok" as const };
          const h = (k: string) => Number(res.headers.get(k) ?? "");
          logBootstrapFetchBreakdownTable({
            "0_server_route_total_ms (header)": serverRouteTotal,
            "1_server_room_snapshot_ms (header)": serverSnapshotMs,
            "2_participants_sql_ms": h("x-samarket-participants-sql-ms"),
            "3_room_profiles_map_ms": h("x-samarket-room-profiles-map-ms"),
            "4_hydrate_labels_ms": h("x-samarket-hydrate-labels-ms"),
            "5_trade_detail_bootstrap_parallel_ms": h("x-samarket-trade-detail-bootstrap-parallel-ms"),
            "6_trade_exit_snapshot_parallel_ms": h("x-samarket-trade-exit-snapshot-parallel-ms"),
            "7_peer_read_cursor_ms": h("x-samarket-peer-read-cursor-ms"),
            "8_participants_profiles_bundle_ms (header)": h("x-samarket-participants-profiles-fetch-ms"),
            "9_trade_detail_normalize_ms": h("x-samarket-trade-detail-normalize-ms"),
            "10_summary_build_ms": h("x-samarket-summary-build-ms"),
            "11_members_map_ms": h("x-samarket-members-map-ms"),
            "12_messages_pipeline_prep_ms": h("x-samarket-messages-pipeline-prep-ms"),
            "13_messages_map_cpu_ms": h("x-samarket-messages-map-cpu-ms"),
            "14_normalize_merge_ms (header sum)": h("x-samarket-normalize-merge-ms"),
            A_client_fetch_to_headers_ms: Math.round(fetchToHeadersMs),
            B_client_body_read_ms: Math.round(responseBodyReadMs),
            C_client_json_parse_ms: jsonParseMsNum,
            D_client_snapshot_parse_ms: snapshotParseMsNum,
            E_client_wire_plus_parse_ms: clientInnerSumMs,
            F_payload_kb: kb,
            G_payload_rule: tier === "ok" ? "ok <50KB" : tier === "review" ? "review ≥50KB" : "problem ≥100KB",
          });
        }
        return { roomRes: res, snap, clientTimings: { clientInnerSumMs } };
      });
      const roomRes = flightResult.roomRes;
      const snap = flightResult.snap;
      const clientTimings = flightResult.clientTimings;
      if (roomRes.ok && snap) {
        setSnapshot(snap);
        if (wantMinimalMembers) {
          // minimal members 로 시작했으면 멤버 전원 로드는 members sheet에서만.
          deferredMemberBootstrapRef.current = true;
        }
        const elapsed =
          typeof performance !== "undefined" ? Math.round(performance.now() - tBoot) : Math.round(Date.now() - tBoot);
        messengerMonitorRoomLoad(roomId, elapsed, { silent, cmReqSrc: reqSrc });
        if (BOOTSTRAP_FETCH_BREAKDOWN && clientTimings) {
          const gap = elapsed - clientTimings.clientInnerSumMs;
          // eslint-disable-next-line no-console
          console.info("[bootstrap_fetch:reconcile]", {
            monitored_bootstrap_fetch_ms: elapsed,
            client_inner_flight_ms: clientTimings.clientInnerSumMs,
            gap_ms_vs_inner_flight: gap,
            note: "gap includes tBoot→fetch start, runSingleFlight wrapper, setSnapshot scheduling",
          });
        }
        if (shouldBlock) {
          const suf = roomId.trim();
          logClientPerf("messenger-room.enter", {
            phase: "bootstrap_fetch",
            blocking: true,
            silent,
            cmReqSrc: reqSrc,
            mode: wantSeed ? "instant" : wantMinimalMembers ? "minimal-members" : "default",
            ms: elapsed,
            roomIdSuffix: suf.length <= 8 ? suf : suf.slice(-8),
          });
        }
      } else if (!silent) {
        // 사일런트 갱신 실패 시 스냅샷을 비우면 Realtime·목록이 끊긴다.
        setSnapshot(null);
      }
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
