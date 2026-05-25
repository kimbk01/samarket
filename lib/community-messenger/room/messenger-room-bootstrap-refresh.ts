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
import {
  consumeRoomSnapshot,
  getRoomSnapshotCacheAgeMs,
  isRoomSnapshotFreshWithin,
  peekRoomSnapshot,
} from "@/lib/community-messenger/room-snapshot-cache";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { forgetSingleFlight, getSingleFlightPromise, runSingleFlight } from "@/lib/http/run-single-flight";
import { resolveCmRoomBootstrapFetchPriority, runCmBootstrapNetworkWork } from "@/lib/community-messenger/dev/cm-event-loop-dev";
import {
  CM_BOOTSTRAP_SNAPSHOT_REUSE_TTL_MS,
  markCmBootstrapFetchResolve,
  markCmBootstrapFetchScheduled,
  normalizeCmBootstrapTriggerSource,
  recordCmBootstrapTriggerChain,
  releaseCmBootstrapRoomLock,
  tryAcquireCmBootstrapRoomLock,
} from "@/lib/community-messenger/room/cm-bootstrap-scheduling";
import {
  evaluateCmRoomForegroundBootstrap,
  isHardForegroundRefresh,
  logCmRoomReentryZeroFetch,
  markCmRoomForegroundBootstrapFailure,
  markCmRoomForegroundBootstrapInflight,
  markCmRoomForegroundBootstrapSuccess,
  markCmRoomSilentBootstrapSuccess,
  releaseCmRoomForegroundBootstrapInflight,
  shouldSkipSilentBootstrap,
  touchCmRoomForegroundLockFromSnapshot,
  type CmForegroundBootstrapSource,
} from "@/lib/community-messenger/room/cm-room-bootstrap-lock";
import {
  bootstrapTierFromQuery,
  CM_BOOTSTRAP_DEBOUNCE_MS,
  evaluateCmBootstrapGate,
  logCmBootstrapTrigger,
  noteCmBootstrapCompleted,
  scheduleCmBootstrapDebounceRetry,
  type CmBootstrapTier,
} from "@/lib/community-messenger/room/cm-bootstrap-orchestration";
import { finishSilentRefreshRound, tryEnterSilentRefreshRound } from "@/lib/http/silent-refresh-coalesce";
import { cmCallIncomingTraceMaybeRoomBootstrap } from "@/lib/community-messenger/cm-call-debug";
import { mergeCommunityMessengerSilentDeltaIntoSnapshot } from "@/lib/community-messenger/room/merge-community-messenger-silent-delta";
import { mergeCommunityMessengerForegroundBootstrapIntoSnapshot } from "@/lib/community-messenger/room/merge-community-messenger-foreground-bootstrap";
import {
  isCmRoomEntryPriorityModeActive,
  logCmRoomBootstrapPatchOnly,
} from "@/lib/community-messenger/room/cm-room-entry-priority-mode";
import { COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT } from "@/lib/community-messenger/types";
import { consumePrefetchHitForRoom } from "@/lib/community-messenger/room-snapshot-cache";
import {
  getMessengerRoomEntryHydrationScheduler,
} from "@/lib/community-messenger/background-hydration-scheduler";
import { noteCmColdEntryBootstrapCompleted } from "@/lib/community-messenger/room/cm-cold-entry-path";
import {
  cmRoomEntryTraceEnabled,
  logCmRoomEntryAnalysis,
  setCmRoomEntryBootstrapMeta,
} from "@/lib/community-messenger/room/cm-room-entry-instrumentation";
import {
  warnCmPerfRegressionReentryForegroundFetch,
  warnCmPerfRegressionRoomClientLegacy,
} from "@/lib/community-messenger/room/cm-messenger-perf-regression-guard";
import { logBootstrapColdFillDeepBreakdownClient } from "@/lib/community-messenger/bootstrap-cold-fill-deep-breakdown";
import type { BootstrapSnapshotTier } from "@/lib/community-messenger/bootstrap-cold-fill-deep-breakdown";

const BOOTSTRAP_FETCH_BREAKDOWN =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE_BOOTSTRAP_BREAKDOWN === "1";

/** primed 페인트 뒤 full 보강 silent GET — 첫 렌더 이후 300~500ms 밴드(즉시 full 금지) */
function roomBootstrapSecondaryEnrichmentDelayMs(): number {
  return 300 + Math.floor(Math.random() * 201);
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

function logCmRoomReentryZeroFetchWithRegression(
  payload: Parameters<typeof logCmRoomReentryZeroFetch>[0]
): void {
  logCmRoomReentryZeroFetch(payload);
  warnCmPerfRegressionReentryForegroundFetch(payload.roomId, {
    foreground_fetch_skipped: payload.foreground_fetch_skipped,
    used_cached_snapshot: payload.used_cached_snapshot,
    snapshot_age_ms: payload.snapshot_age_ms,
  });
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
  /** `consumeRoomSnapshot` 직후 full 보강 silent 타이머(100~300ms) — 언마운트·재진입 시 클리어 */
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
  forgetSingleFlight(
    `cm-room-bootstrap:${uid}:${rid}:?mode=instant&memberHydration=minimal&hydration=critical&cmReqSrc=room_client_block&messages=${COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT}`
  );
  forgetSingleFlight(`cm-room-bootstrap:${uid}:${rid}:?snapshotTier=silent_delta&cmReqSrc=room_silent`);
  forgetSingleFlight(`cm-room-bootstrap:${uid}:${rid}:?memberHydration=minimal&snapshotTier=silent_delta&cmReqSrc=room_silent`);
}

/**
 * 메신저 방 HTTP 부트스트랩 갱신 — `CommunityMessengerRoomClient` 와 동일 동작(프라임·single-flight).
 * 컴포넌트 밖 두어 리렌더마다 콜백 본문 재생성 범위를 줄인다.
 */
type BootstrapFlightResult = {
  roomRes: Response;
  snap: CommunityMessengerRoomSnapshot | null;
  clientTimings: {
    clientInnerSumMs: number;
    client_fetch_ms: number;
    client_json_parse_ms: number;
    snapshot_parse_ms: number;
  };
};

function resolveBootstrapSnapshotTier(args: {
  bootstrapTierHdr: string;
  bootstrapQueryWithSrc: string;
  silent: boolean;
}): BootstrapSnapshotTier {
  if (args.bootstrapTierHdr === "silent_delta" || args.bootstrapQueryWithSrc.includes("silent_delta")) {
    return "silent_delta";
  }
  if (
    args.bootstrapQueryWithSrc.includes("hydration=critical") ||
    args.bootstrapQueryWithSrc.includes("mode=instant")
  ) {
    return "critical";
  }
  if (args.bootstrapQueryWithSrc.includes("snapshotTier=fast")) return "fast";
  return args.silent ? "silent_delta" : "full";
}

export function createMessengerRoomBootstrapRefresh(
  deps: MessengerRoomBootstrapRefreshDeps
): (
  silent?: boolean,
  opts?: { forceSilentNetwork?: boolean; triggerReason?: string; forceForegroundBlock?: boolean }
) => Promise<void> {
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

  function applyBootstrapFlightResult(args: {
    roomRes: Response;
    snap: CommunityMessengerRoomSnapshot | null;
    clientTimings: BootstrapFlightResult["clientTimings"];
    silent: boolean;
    shouldBlock: boolean;
    bootstrapQueryWithSrc: string;
    reqSrc: string;
    bootstrapTierHdr: string;
    tBoot: number;
  }): void {
    const {
      roomRes,
      snap,
      clientTimings,
      silent,
      shouldBlock,
      bootstrapQueryWithSrc,
      reqSrc,
      bootstrapTierHdr,
      tBoot,
    } = args;
    const tApply0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (roomRes.ok && snap) {
      if (silent && bootstrapTierHdr === "silent_delta") {
        setSnapshot((prev) => {
          if (prev) return mergeCommunityMessengerSilentDeltaIntoSnapshot(prev, snap);
          if (typeof console !== "undefined") {
            console.warn("[cm-room-bootstrap] silent_delta applied without prior snapshot");
          }
          return snap;
        });
      } else {
        setSnapshot((prev) => {
          if (prev && snap && !prev.clientShellPlaceholder) {
            const patched = mergeCommunityMessengerForegroundBootstrapIntoSnapshot(prev, snap);
            logCmRoomBootstrapPatchOnly({
              roomId,
              patched_messages: (snap.messages?.length ?? 0) > 0,
              patched_members: (snap.members?.length ?? 0) > 0,
              full_remount: false,
              cmReqSrc: reqSrc,
            });
            return patched;
          }
          return snap;
        });
      }
      const usedMinimalMemberHydration =
        shouldBlock || bootstrapQueryWithSrc.includes("memberHydration=minimal");
      if (usedMinimalMemberHydration) {
        deferredMemberBootstrapRef.current = true;
      }
      const elapsed =
        typeof performance !== "undefined" ? Math.round(performance.now() - tBoot) : Math.round(Date.now() - tBoot);
      messengerMonitorRoomLoad(roomId, elapsed, { silent, cmReqSrc: reqSrc });
      const client_apply_ms =
        typeof performance !== "undefined"
          ? Math.round(performance.now() - tApply0)
          : Math.round(Date.now() - tApply0);
      const serverRouteTotal = Number(roomRes.headers.get("x-samarket-route-total-ms") ?? "");
      const serverSnapshotMs = Number(roomRes.headers.get("x-samarket-room-bootstrap-fetch-ms") ?? "");
      const sizeBytes = Number(roomRes.headers.get("x-samarket-response-size-bytes") ?? "");
      const cacheHitHdr = roomRes.headers.get("x-samarket-bootstrap-cache-hit") === "1" ? 1 : 0;
      const snapshotTier = resolveBootstrapSnapshotTier({
        bootstrapTierHdr,
        bootstrapQueryWithSrc,
        silent,
      });
      logBootstrapColdFillDeepBreakdownClient({
        route_total_ms: Number.isFinite(serverRouteTotal) ? Math.round(serverRouteTotal) : undefined,
        rpc_ms: Number.isFinite(serverSnapshotMs) ? Math.round(serverSnapshotMs) : undefined,
        response_bytes: Number.isFinite(sizeBytes) ? Math.round(sizeBytes) : undefined,
        client_fetch_ms: clientTimings.client_fetch_ms,
        client_json_parse_ms: clientTimings.client_json_parse_ms,
        client_apply_ms,
        snapshotTier,
        cmReqSrcRaw: reqSrc,
        roomId,
        cache_hit: cacheHitHdr,
        snapshot_via: roomRes.headers.get("x-samarket-room-bootstrap-snapshot-via"),
        silent_delta_fallback:
          silent && reqSrc === "room_silent" && bootstrapTierHdr !== "silent_delta" ? 1 : 0,
      });
    } else if (!silent) {
      setSnapshot(null);
    }
  }

  async function refresh(
    silent = false,
    opts?: {
      /** 상대 읽음 커서 등 — debounce 없이 반드시 네트워크 */
      forceSilentNetwork?: boolean;
      triggerReason?: string;
      /** lifecycle 첫 차단 — loadedRef·IndexedDB 와 무관하게 block 1회만 */
      forceForegroundBlock?: boolean;
    }
  ): Promise<void> {
    if (silent) {
      const now = Date.now();
      if (now < silentBackoffUntil) return;
      if (!opts?.forceSilentNetwork && now - lastSilentRefreshAt < CM_BOOTSTRAP_DEBOUNCE_MS) {
        if (coalesceTimerRef.current != null) clearTimeout(coalesceTimerRef.current);
        coalesceTimerRef.current = setTimeout(() => {
          coalesceTimerRef.current = null;
          void refresh(true, { ...opts, triggerReason: opts?.triggerReason ?? "silent_coalesce_timer" });
        }, Math.max(1, CM_BOOTSTRAP_DEBOUNCE_MS - (Date.now() - lastSilentRefreshAt)));
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
    const viewerIdForCache = viewerBootstrapDedupRef.current.trim() || null;
    const peekSnapEarly = peekRoomSnapshot(roomId, viewerIdForCache);
    const hardRefresh = isHardForegroundRefresh({
      triggerReason: opts?.triggerReason,
      forceSilentNetwork: opts?.forceSilentNetwork,
      peekSnapshot: peekSnapEarly,
    });
    if (
      silent &&
      isCmRoomEntryPriorityModeActive() &&
      !opts?.forceSilentNetwork &&
      (opts?.triggerReason?.includes("realtime") ?? false)
    ) {
      finishSilentRefreshRound(silent, silentRoomRefreshBusyRef, silentRoomRefreshAgainRef, () => {});
      loadedRef.current = true;
      setRoomReadyForRealtime(true);
      return;
    }
    if (silent && !hardRefresh) {
      const silentSkip = shouldSkipSilentBootstrap(roomId, opts?.forceSilentNetwork === true);
      if (silentSkip.skip) {
        logCmRoomReentryZeroFetchWithRegression({
          roomId,
          used_cached_snapshot: Boolean(peekSnapEarly),
          foreground_fetch_skipped: false,
          silent_fetch_scheduled: false,
          silent_fetch_skipped: true,
          snapshot_age_ms: silentSkip.snapshotAgeMs,
        });
        finishSilentRefreshRound(silent, silentRoomRefreshBusyRef, silentRoomRefreshAgainRef, () => {});
        loadedRef.current = true;
        setRoomReadyForRealtime(true);
        return;
      }
    }
    if (!silent && swrDeferredBootstrapTimerRef.current) {
      clearTimeout(swrDeferredBootstrapTimerRef.current);
      swrDeferredBootstrapTimerRef.current = null;
    }
    const cacheFresh5s =
      !silent &&
      isRoomSnapshotFreshWithin(roomId, CM_BOOTSTRAP_SNAPSHOT_REUSE_TTL_MS, viewerIdForCache);
    const primed =
      !silent &&
      (cacheFresh5s && peekSnapEarly
        ? peekSnapEarly
        : consumeRoomSnapshot(roomId, viewerIdForCache));
    const forceForegroundBlock =
      opts?.forceForegroundBlock === true || opts?.triggerReason === "lifecycle_blocking_first";
    let shouldBlock = !silent && (forceForegroundBlock || (!loadedRef.current && !primed));
    try {
      if (primed) {
        setSnapshot(primed);
        setLoading(false);
        if (cmRoomEntryTraceEnabled()) {
          const prefetchHit = consumePrefetchHitForRoom(roomId);
          const bytes = new TextEncoder().encode(JSON.stringify(primed)).length;
          const kb = Math.round((bytes / 1024) * 10) / 10;
          setCmRoomEntryBootstrapMeta({
            payload_kb: kb,
            used_prefetch: prefetchHit,
            used_cached_snapshot: true,
          });
          noteCmColdEntryBootstrapCompleted(roomId, false);
        }
        const delayMs = roomBootstrapSecondaryEnrichmentDelayMs();
        const scheduleSecondary = () => {
          getMessengerRoomEntryHydrationScheduler().schedule({
            id: `room_bootstrap_secondary:${roomId}`,
            dedupeKey: `room_bootstrap_secondary:${roomId}`,
            priority: "low",
            run: async (signal) => {
              await new Promise<void>((resolve) => {
                const t = window.setTimeout(resolve, delayMs);
                signal.addEventListener("abort", () => clearTimeout(t), { once: true });
              });
              if (signal.aborted) return;
              const secondaryFresh = isRoomSnapshotFreshWithin(
                roomId,
                CM_BOOTSTRAP_SNAPSHOT_REUSE_TTL_MS,
                viewerIdForCache
              );
              if (secondaryFresh) return;
              await refresh(true, {
                triggerReason: "room_bootstrap_secondary_idle",
              });
            },
          });
        };
        if (cacheFresh5s) {
          touchCmRoomForegroundLockFromSnapshot(roomId, primed);
          logCmRoomReentryZeroFetchWithRegression({
            roomId,
            used_cached_snapshot: true,
            foreground_fetch_skipped: true,
            silent_fetch_scheduled: false,
            silent_fetch_skipped: true,
            snapshot_age_ms: getRoomSnapshotCacheAgeMs(roomId, viewerIdForCache),
          });
          loadedRef.current = true;
          setRoomReadyForRealtime(true);
          setLoading(false);
          return;
        }
        if (typeof window !== "undefined") {
          /** 첫 페인트 이후에만 full 보강(즉시 full GET 금지) — rAF 2회 뒤 LOW 큐에 합류 */
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scheduleSecondary();
            });
          });
        } else if (typeof setTimeout !== "undefined") {
          setTimeout(scheduleSecondary, delayMs);
        }
      } else {
      const tBoot = typeof performance !== "undefined" ? performance.now() : Date.now();
      /** 첫 차단 네트워크는 항상 instant+critical(서버에서 trade/normalize/full 병렬 차단) — 시드 슬라이스는 SEED_LIMIT 과 동일 */
      const BLOCKING_FIRST_BOOTSTRAP_Q =
        `?mode=instant&memberHydration=minimal&hydration=critical&cmReqSrc=room_client_block&messages=${COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT}`;
      const INSTANT_LEGACY_Q =
        `?mode=instant&memberHydration=minimal&hydration=critical&cmReqSrc=room_client_legacy&messages=${COMMUNITY_MESSENGER_ROOM_BOOTSTRAP_SEED_MESSAGE_LIMIT}`;
      let bootstrapQueryWithSrc: string;
      let reqSrc: string;
      const peekSnap = peekSnapEarly ?? peekRoomSnapshot(roomId, viewerIdForCache);
      const hasPrefetchSnapshot = cacheFresh5s;

      if (!silent) {
        const fg = evaluateCmRoomForegroundBootstrap({
          roomId,
          triggerReason: opts?.triggerReason,
          forceBlock: forceForegroundBlock,
          requestedLegacy: !forceForegroundBlock,
          hasLocalSnapshot: Boolean(peekSnap),
          hasPrefetchSnapshot,
          peekSnapshot: peekSnap,
          hardRefresh,
          viewerUserId: viewerIdForCache,
        });
        if (fg.action === "skip") {
          if (fg.reuseSnapshot) {
            setSnapshot(fg.reuseSnapshot);
            setLoading(false);
            touchCmRoomForegroundLockFromSnapshot(roomId, fg.reuseSnapshot);
          }
          logCmRoomReentryZeroFetchWithRegression({
            roomId,
            used_cached_snapshot: Boolean(fg.reuseSnapshot),
            foreground_fetch_skipped: true,
            silent_fetch_scheduled: false,
            silent_fetch_skipped: shouldSkipSilentBootstrap(roomId, false).skip,
            snapshot_age_ms: getRoomSnapshotCacheAgeMs(roomId, viewerIdForCache),
          });
          loadedRef.current = true;
          setRoomReadyForRealtime(true);
          finishSilentRefreshRound(silent, silentRoomRefreshBusyRef, silentRoomRefreshAgainRef, () => {});
          return;
        }
        reqSrc = fg.reqSrc;
        bootstrapQueryWithSrc = fg.reqSrc === "room_client_block" ? BLOCKING_FIRST_BOOTSTRAP_Q : INSTANT_LEGACY_Q;
        shouldBlock = fg.reqSrc === "room_client_block";
        if (fg.reqSrc === "room_client_legacy") {
          warnCmPerfRegressionRoomClientLegacy(roomId, {
            reason: fg.reason,
            decision: "proceed",
            trigger_reason: opts?.triggerReason ?? null,
          });
        }
        markCmRoomForegroundBootstrapInflight(roomId, fg.reqSrc);
      } else {
        reqSrc = "room_silent";
        /** 사일런트: `silent_delta` — 방·내 참가자 포인터만; 프로필·통화·presence·trade enrich 없음. 거래 카드는 `fetchChatRoomDetailApi` 등으로 후속. */
        bootstrapQueryWithSrc = opts?.forceSilentNetwork
          ? deferredMemberBootstrapRef.current
            ? "?memberHydration=minimal&snapshotTier=silent_delta&cmReqSrc=room_silent"
            : "?snapshotTier=silent_delta&cmReqSrc=room_silent"
          : deferredMemberBootstrapRef.current
            ? "?memberHydration=minimal&snapshotTier=silent_delta&cmReqSrc=room_silent"
            : "?snapshotTier=silent_delta&cmReqSrc=room_silent";
      }
      const viewer = viewerBootstrapDedupRef.current.trim() || "anon";
      const flightKey = `cm-room-bootstrap:${viewer}:${roomId}:${bootstrapQueryWithSrc}`;
      const tier: CmBootstrapTier = bootstrapTierFromQuery(bootstrapQueryWithSrc);
      const triggerReason =
        opts?.triggerReason ??
        (silent
          ? opts?.forceSilentNetwork
            ? "silent_force_network"
            : "silent"
          : shouldBlock
            ? "blocking_first"
            : "legacy");
      const triggerSource = normalizeCmBootstrapTriggerSource(triggerReason);
      const gate = evaluateCmBootstrapGate({
        roomId,
        tier,
        flightKey,
        forceNetwork: opts?.forceSilentNetwork === true,
      });
      recordCmBootstrapTriggerChain({
        trigger_source: triggerSource,
        roomId,
        tier,
        inflight_existing: gate.inflightExisting,
        deduped: gate.skippedReason === "stale_reuse",
        debounced: gate.debounced,
        skipped_reason: gate.skippedReason,
      });
      logCmBootstrapTrigger({
        reason: triggerReason,
        roomId,
        tier,
        since_last_bootstrap_ms: gate.sinceLastBootstrapMs,
        inflight_existing: gate.inflightExisting,
        debounced: gate.debounced,
        skipped_reason: gate.skippedReason,
        flight_key: flightKey.length > 120 ? `${flightKey.slice(0, 120)}…` : flightKey,
      });
      if (
        silent &&
        loadedRef.current &&
        !opts?.forceSilentNetwork &&
        tier === "silent_delta" &&
        isRoomSnapshotFreshWithin(
          roomId,
          CM_BOOTSTRAP_SNAPSHOT_REUSE_TTL_MS,
          viewerBootstrapDedupRef.current.trim() || null
        )
      ) {
        recordCmBootstrapTriggerChain({
          trigger_source: triggerSource,
          roomId,
          tier,
          skipped_reason: "local_snapshot_sufficient",
          deduped: true,
        });
        finishSilentRefreshRound(silent, silentRoomRefreshBusyRef, silentRoomRefreshAgainRef, () => {});
        loadedRef.current = true;
        setRoomReadyForRealtime(true);
        return;
      }
      if (!gate.proceed) {
        if (!silent) {
          releaseCmRoomForegroundBootstrapInflight(roomId);
        }
        if (gate.skippedReason === "stale_reuse" && gate.staleEntry) {
          const stale = gate.staleEntry;
          applyBootstrapFlightResult({
            roomRes: new Response(null, { status: 200 }),
            snap: stale.snap,
            clientTimings: {
              clientInnerSumMs: 0,
              client_fetch_ms: 0,
              client_json_parse_ms: 0,
              snapshot_parse_ms: 0,
            },
            silent,
            shouldBlock,
            bootstrapQueryWithSrc,
            reqSrc,
            bootstrapTierHdr: stale.bootstrapTierHdr,
            tBoot: typeof performance !== "undefined" ? performance.now() : Date.now(),
          });
        } else if (gate.skippedReason === "inflight_join") {
          const inflight = getSingleFlightPromise<BootstrapFlightResult>(flightKey);
          if (inflight) {
            const joined = await inflight;
            applyBootstrapFlightResult({
              roomRes: joined.roomRes,
              snap: joined.snap,
              clientTimings: joined.clientTimings,
              silent,
              shouldBlock,
              bootstrapQueryWithSrc,
              reqSrc,
              bootstrapTierHdr: joined.roomRes.headers.get("x-samarket-bootstrap-tier") ?? tier,
              tBoot: typeof performance !== "undefined" ? performance.now() : Date.now(),
            });
          }
        } else if (gate.skippedReason === "debounced") {
          const waitMs = Math.max(
            1,
            CM_BOOTSTRAP_DEBOUNCE_MS - (gate.sinceLastBootstrapMs ?? CM_BOOTSTRAP_DEBOUNCE_MS)
          );
          scheduleCmBootstrapDebounceRetry({
            roomId,
            tier,
            delayMs: waitMs,
            run: () => {
              void refresh(silent, { ...opts, triggerReason: "debounced_retry" });
            },
          });
        }
        finishSilentRefreshRound(silent, silentRoomRefreshBusyRef, silentRoomRefreshAgainRef, () => {
          void refresh(true, { triggerReason: "silent_refresh_round_again" });
        });
        loadedRef.current = true;
        if (shouldBlock) setLoading(false);
        setRoomReadyForRealtime(true);
        return;
      }
      if (silent && loadedRef.current && !opts?.forceSilentNetwork) {
        const now = Date.now();
        if (
          silentSameKeyCoalesceRef.key === flightKey &&
          now - silentSameKeyCoalesceRef.at < CM_BOOTSTRAP_DEBOUNCE_MS
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
      const fetchPriority = resolveCmRoomBootstrapFetchPriority({
        silent,
        shouldBlock,
        forceSilentNetwork: opts?.forceSilentNetwork,
        loaded: loadedRef.current,
      });
      const scheduledDelayMs = fetchPriority === "idle" ? 480 : 0;
      const lock = tryAcquireCmBootstrapRoomLock(roomId, shouldBlock);
      if (lock.dropped) {
        recordCmBootstrapTriggerChain({
          trigger_source: triggerSource,
          roomId,
          tier,
          dropped: true,
          inflight_existing: true,
          skipped_reason: "room_lock_busy",
        });
        finishSilentRefreshRound(silent, silentRoomRefreshBusyRef, silentRoomRefreshAgainRef, () => {});
        return;
      }
      let flightResult: BootstrapFlightResult;
      try {
        flightResult = await new Promise<BootstrapFlightResult>((resolveFlight, rejectFlight) => {
        const executeFetch = async () => {
          markCmBootstrapFetchScheduled(roomId, scheduledDelayMs);
          try {
            const result = await runSingleFlight(flightKey, async () => {
              const tFetch = typeof performance !== "undefined" ? performance.now() : Date.now();
              if (shouldBlock) {
                recordRouteEntryElapsedMetric("messenger_room_entry", "room_bootstrap_request_start_ms");
              }
              cmCallIncomingTraceMaybeRoomBootstrap(roomId, "start");
              if (shouldBlock && typeof console !== "undefined") {
                const suf = roomId.trim();
                console.info("[cm-room-bootstrap] blocking_fetch_start", {
                  perfNow: typeof performance !== "undefined" ? performance.now() : Date.now(),
                  roomIdSuffix: suf.length <= 8 ? suf : suf.slice(-8),
                  cmReqSrc: reqSrc,
                });
              }
              const res = await fetch(`${communityMessengerRoomBootstrapPath(roomId)}${bootstrapQueryWithSrc}`, {
                cache: "default",
                credentials: "include",
              });
              markCmBootstrapFetchResolve(roomId);
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
              const tJson0 = typeof performance !== "undefined" ? performance.now() : Date.now();
              let raw: unknown = null;
              try {
                raw = JSON.parse(bodyText) as unknown;
              } catch {
                raw = null;
              }
              const tAfterJson = typeof performance !== "undefined" ? performance.now() : Date.now();
              const jsonParseMsNum =
                typeof performance !== "undefined"
                  ? Math.round(tAfterJson - tJson0)
                  : Math.round(Date.now() - (tJson0 as number));
              const tSnap0 = typeof performance !== "undefined" ? performance.now() : Date.now();
              const snap = parseCommunityMessengerRoomSnapshotResponse(raw);
              const snapshotParseMsNum =
                typeof performance !== "undefined"
                  ? Math.round(performance.now() - tSnap0)
                  : Math.round(Date.now() - (tSnap0 as number));
              cmCallIncomingTraceMaybeRoomBootstrap(roomId, "done");
              if (shouldBlock) {
                recordRouteEntryElapsedMetric("messenger_room_entry", "room_bootstrap_json_parse_complete_ms");
                recordRouteEntryJsonParseComplete("messenger_room_entry");
              }
              const clientInnerSumMs =
                Math.round(fetchToHeadersMs) +
                Math.round(responseBodyReadMs) +
                jsonParseMsNum +
                snapshotParseMsNum;
              if (BOOTSTRAP_FETCH_BREAKDOWN) {
                const { kb, tier } =
                  Number.isFinite(sizeBytes) && sizeBytes > 0
                    ? payloadSizeTierKb(sizeBytes)
                    : { kb: 0, tier: "ok" as const };
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
                  G_payload_rule:
                    tier === "ok" ? "ok <50KB" : tier === "review" ? "review ≥50KB" : "problem ≥100KB",
                });
              }
              return {
                roomRes: res,
                snap,
                clientTimings: {
                  clientInnerSumMs,
                  client_fetch_ms: Math.round(clientWireMs),
                  client_json_parse_ms: jsonParseMsNum,
                  snapshot_parse_ms: snapshotParseMsNum,
                },
              };
            });
            resolveFlight(result);
          } catch (err) {
            rejectFlight(err);
          }
        };
        runCmBootstrapNetworkWork(fetchPriority, executeFetch);
      });
      } finally {
        releaseCmBootstrapRoomLock(roomId);
        if (!silent) {
          releaseCmRoomForegroundBootstrapInflight(roomId);
        }
      }
      const roomRes = flightResult.roomRes;
      const snap = flightResult.snap;
      const clientTimings = flightResult.clientTimings;
      const bootstrapTierHdr = roomRes.headers.get("x-samarket-bootstrap-tier") ?? "";
      if (roomRes.ok && snap) {
        noteCmBootstrapCompleted({ roomId, tier, flightKey, snap, bootstrapTierHdr });
        if (!silent) {
          markCmRoomForegroundBootstrapSuccess({
            roomId,
            snap,
            tier,
            reqSrc: reqSrc as CmForegroundBootstrapSource,
          });
        } else {
          markCmRoomSilentBootstrapSuccess(roomId);
        }
      } else if (!silent) {
        markCmRoomForegroundBootstrapFailure(roomId, reqSrc as CmForegroundBootstrapSource);
      }
      applyBootstrapFlightResult({
        roomRes,
        snap,
        clientTimings,
        silent,
        shouldBlock,
        bootstrapQueryWithSrc,
        reqSrc,
        bootstrapTierHdr,
        tBoot,
      });
      if (roomRes.ok && snap) {
        const elapsed =
          typeof performance !== "undefined" ? Math.round(performance.now() - tBoot) : Math.round(Date.now() - tBoot);
        if (shouldBlock && roomRes.ok && snap && cmRoomEntryTraceEnabled()) {
          const prefetchHit = consumePrefetchHitForRoom(roomId);
          const sizeB = Number(roomRes.headers.get("x-samarket-response-size-bytes") ?? "");
          const kb =
            Number.isFinite(sizeB) && sizeB > 0 ? Math.round((sizeB / 1024) * 10) / 10 : 0;
          setCmRoomEntryBootstrapMeta({
            payload_kb: kb,
            used_prefetch: prefetchHit,
            used_cached_snapshot: false,
          });
          noteCmColdEntryBootstrapCompleted(roomId, true);
          const srvSnap = Number(roomRes.headers.get("x-samarket-room-bootstrap-fetch-ms") ?? "");
          const routeTot = Number(roomRes.headers.get("x-samarket-route-total-ms") ?? "");
          const suf = roomId.trim();
          logCmRoomEntryAnalysis({
            phase: "blocking_bootstrap_response",
            room_id_suffix: suf.length <= 8 ? suf : suf.slice(-8),
            route_start_ms: null,
            server_snapshot_ms: Number.isFinite(srvSnap) ? Math.round(srvSnap) : null,
            server_route_total_ms: Number.isFinite(routeTot) ? Math.round(routeTot) : null,
            client_hydrate_ms: clientTimings?.clientInnerSumMs ?? null,
            room_shell_visible_ms: null,
            message_list_visible_ms: null,
            composer_visible_ms: null,
            realtime_ready_ms: null,
            deferred_hydrate_ms: null,
            payload_kb: kb,
            note: "UI 마일스톤은 [cm-room-entry-v2] — shell/list/composer/realtime 마운트 후",
          });
        }
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
            mode: shouldBlock ? "instant" : silent ? "silent" : "instant-legacy",
            ms: elapsed,
            roomIdSuffix: suf.length <= 8 ? suf : suf.slice(-8),
          });
        }
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
