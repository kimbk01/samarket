"use client";

/** 메신저 홈 데이터 경로: lite→open-groups 보강·silent `home-sync`·부트스트랩 GET 단일 비행 — `docs/trade-lightweight-design.md` / `SAMARKET_LIGHTWEIGHT_GOALS`. */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { unstable_batchedUpdates } from "react-dom";
import { fetchCommunityMessengerHomeSilentLists } from "@/lib/community-messenger/cm-home-silent-lists-fetch";
import {
  applyCmHomeCutoverGateFromResponseJson,
  noteCmHomeCutoverNetworkSeed,
  peekCmHomeCutoverGate,
  startCmHomeCutoverGateMultiTab,
} from "@/lib/community-messenger/home/cm-home-cutover-gate-client";
import {
  messengerMonitorHomeListBootstrapUiAlign,
  messengerMonitorHomeSyncFetchMs,
  messengerMonitorSilentFailFallbackBootstrapMs,
} from "@/lib/community-messenger/monitoring/client";
import {
  clearBootstrapCache,
  cmWarmNetworkPayloadFingerprint,
  cmWarmNetworkRoomIdsFingerprint,
  consumeWarmNetworkProvenance,
  peekBootstrapCache,
  peekMessengerBootstrapCritical,
  peekMessengerBootstrapFull,
  peekMessengerBootstrapMinimal,
  primeBootstrapCache,
  primeMessengerBootstrapCritical,
  primeMessengerBootstrapFull,
  primeMessengerBootstrapMinimal,
} from "@/lib/community-messenger/bootstrap-cache";
import { fetchCommunityMessengerBootstrapCriticalClient } from "@/lib/community-messenger/cm-bootstrap-client-fetch";
import {
  anchorCmClientMergeBreakdownFromResponse,
  finalizeCmClientMergeBreakdown,
  scheduleCmClientMergeBreakdownFinalize,
  markCmClientMergeStart,
  recordCmClientMergePatchStats,
  recordCmClientMergeStoreEmitMs,
  resetCmClientMergeBreakdown,
} from "@/lib/community-messenger/cm-client-merge-breakdown";
import {
  getCmClientFirstPaintActiveSessionId,
  markCmClientFirstPaint,
  probeCmLiteFirstPaintDomIfReady,
} from "@/lib/community-messenger/cm-client-first-paint-perf";
import {
  beginLiteClientMergeGate,
  deferHomeSyncPatchDuringLiteMerge,
  endLiteClientMergeGate,
  finishHomeBootstrapRefreshRound,
  isLiteClientMergeGateActive,
  markLiteMergeFollowUpsUnblocked,
  noteHomeSyncPayloadFlushed,
  registerDeferredHomeSyncRunner,
  shouldDeferPostLiteFollowUp,
  homeSyncPayloadHasUnreadIncreaseAgainstBase,
  homeSyncPayloadNeedsReactUnreadSync,
  shouldSkipHomeSyncPayload,
  tryEnterHomeBootstrapRefreshRound,
} from "@/lib/community-messenger/home/lite-merge-gate";
import { noteBootstrapUnreadIncreasesFromBootstrap } from "@/lib/community-messenger/merge-critical-home-sync-room-summary";
import {
  logCmBootstrapV2ClientFinalize,
  markCmBootstrapV2ClientFlowAnchor,
} from "@/lib/community-messenger/cm-bootstrap-v2-client-log";
import { communityMessengerBootstrapFromCriticalPayload } from "@/lib/community-messenger/home/critical-bootstrap-to-partial";
import {
  createMessengerHomeShadowDispatch,
  type MessengerHomeShadowDispatch,
} from "@/lib/community-messenger/home/inbox-pipeline/shadow";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerBootstrapCritical,
  CommunityMessengerCallLog,
  CommunityMessengerFriendRequest,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import { applyHomeListPatch, peekLastHomeListPatchStats } from "@/lib/community-messenger/home-list-patch";
import { finishSilentRefreshRound, tryEnterSilentRefreshRound } from "@/lib/http/silent-refresh-coalesce";
import { isLikelyFetchAbortError, logFetchClientTelemetry } from "@/lib/http/fetch-client-telemetry";
import { fetchCommunityMessengerBootstrapClient } from "@/lib/community-messenger/cm-bootstrap-client-fetch";
import {
  logMessengerCriticalDone,
  logMessengerDeferredDone,
  logMessengerDeferredStart,
} from "@/lib/community-messenger/app-shell-fast-path-log";
import { getMessengerBackgroundHydrationScheduler } from "@/lib/community-messenger/background-hydration-scheduler";
import { mergeDiscoverableGroupsFromOpenGroupsClient } from "@/lib/community-messenger/merge-discoverable-open-groups-client";
import {
  recordMessengerBootstrapJsonParseComplete,
  recordMessengerHomeRefreshInvocation,
  samarketMessengerHomeDebugEvent,
} from "@/lib/runtime/samarket-runtime-debug";
import { messengerVerboseTraceConsoleEnabled } from "@/lib/community-messenger/messenger-trace-console";
import {
  resolveMessengerHomeBootstrapSetData,
  useCmDevRenderTrace,
} from "@/lib/community-messenger/dev/cm-event-loop-dev";
import { profileArraysReferenceEqual } from "@/lib/community-messenger/home/merge-bootstrap-lists-preserve-refs";
import { isDevSafeMode } from "@/lib/dev/is-dev-safe-mode";
import {
  deferHomeSyncMerge,
  shouldDeferDuringRoomEntryQuiet,
  shouldDeferHomeSyncStart,
} from "@/lib/community-messenger/room/cm-room-entry-priority-mode";

/**
 * Cold complete bootstrap(lite/full) apply 가 여전히 유효한지 판정한다.
 *
 * COLD_COMPLETE_APPLY_SUPERSEDED_BY_HOME_SYNC_REQUEST 방지 계약:
 * - complete apply 는 자신의 apply-gen 이 최신일 때만 store 에 반영된다.
 * - silent home_sync `refresh(true)` 는 apply-gen 을 올리지 않으므로, home_sync 가 뒤늦게 도착·발화해도
 *   아직 유효한 cold complete apply 를 stale 로 드롭하지 못한다(→ terminal 53 보존).
 * - 더 새로운 non-silent cold complete bootstrap 은 apply-gen 을 올리므로 이전 complete 는 정상 drop.
 * - route change / unmount 로 controller 가 abort 되면 drop.
 */
export function shouldApplyColdBootstrapComplete(args: {
  capturedApplyGen: number;
  currentApplyGen: number;
  aborted: boolean;
}): boolean {
  if (args.aborted) return false;
  return args.capturedApplyGen === args.currentApplyGen;
}

/** lite/full·open-groups 보강 — 셸 페인트 이후 `requestIdleCallback`(폴백 `setTimeout`) */
function scheduleMessengerDeferredOnIdle(run: () => void): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem("samarket:cm:eager-lite-merge") === "1") {
      queueMicrotask(run);
      return;
    }
  } catch {
    /* */
  }
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => run(), { timeout: 2000 });
  } else {
    window.setTimeout(run, 0);
  }
}

/** lite `setData` 직후·rAF2 — DOM 프로브 후 gate 해제·breakdown (home-sync flush 가 paint 를 막지 않게) */
function runAfterLiteClientMergePaint(complete: () => void): void {
  probeCmLiteFirstPaintDomIfReady();
  if (typeof requestAnimationFrame !== "function") {
    queueMicrotask(() => {
      probeCmLiteFirstPaintDomIfReady();
      complete();
    });
    return;
  }
  requestAnimationFrame(() => {
    probeCmLiteFirstPaintDomIfReady();
    requestAnimationFrame(() => {
      probeCmLiteFirstPaintDomIfReady();
      complete();
    });
  });
}

function completeLiteClientMergeAfterPaint(): void {
  endLiteClientMergeGate();
  markLiteMergeFollowUpsUnblocked();
  finalizeCmClientMergeBreakdown();
  scheduleCmClientMergeBreakdownFinalize();
}

/** lite/full API JSON → 클라 `CommunityMessengerBootstrap` (deferred 단계 전용) */
function messengerBootstrapFromLiteApiJson(
  json: CommunityMessengerBootstrap & { ok?: boolean; deferredCallLog?: boolean }
): CommunityMessengerBootstrap {
  const deferred = Boolean(json.deferredCallLog);
  return {
    me: json.me ?? null,
    tabs: {
      friends: json.tabs?.friends ?? 0,
      chats: json.tabs?.chats ?? 0,
      groups: json.tabs?.groups ?? 0,
      calls: json.tabs?.calls ?? 0,
    },
    friends: json.friends ?? [],
    following: json.following ?? [],
    hidden: json.hidden ?? [],
    blocked: json.blocked ?? [],
    requests: json.requests ?? [],
    chats: json.chats ?? [],
    groups: json.groups ?? [],
    discoverableGroups: json.discoverableGroups ?? [],
    calls: json.calls ?? [],
    ...(deferred ? { deferredCallLog: true as const } : {}),
    clientHydrationTier: "full",
  };
}

function abortSignalAny(signals: AbortSignal[]): AbortSignal {
  const alive = signals.filter(Boolean);
  if (alive.length === 0) {
    const c = new AbortController();
    c.abort();
    return c.signal;
  }
  const firstAborted = alive.find((s) => s.aborted);
  if (firstAborted) return firstAborted;
  const mergeFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof mergeFn === "function") return mergeFn(alive);
  return alive[0]!;
}

const STALE_CACHE_RESUME_SILENT_REFRESH_COOLDOWN_MS = 20_000;
/** silent home-sync·visibility 직후 폭주 완화 — `refresh(true)` 최소 간격 */
const HOME_SILENT_REFRESH_MIN_GAP_MS = 680;
const INITIAL_FOREGROUND_BOOTSTRAP_SS_KEY = "samarket:cm:initial-foreground-bootstrap:v1";
let lastStaleCacheResumeSilentRefreshAt = 0;

/** React Strict Mode 이중 마운트에서 foreground `refresh(false)` 가 두 번 열리지 않게 */
function tryClaimInitialForegroundBootstrap(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (sessionStorage.getItem(INITIAL_FOREGROUND_BOOTSTRAP_SS_KEY) === "1") return false;
    sessionStorage.setItem(INITIAL_FOREGROUND_BOOTSTRAP_SS_KEY, "1");
    return true;
  } catch {
    return true;
  }
}

function peekClientStaleBootstrap(): CommunityMessengerBootstrap | null {
  if (typeof window === "undefined") return null;
  const fullCached = peekMessengerBootstrapFull();
  if (fullCached) return fullCached;
  const minCached = peekMessengerBootstrapMinimal();
  if (minCached) return minCached;
  const critCached = peekMessengerBootstrapCritical();
  if (!critCached) return null;
  return communityMessengerBootstrapFromCriticalPayload(critCached);
}

function homeBootstrapHasListRooms(data: CommunityMessengerBootstrap | null | undefined): boolean {
  if (!data) return false;
  return (data.chats?.length ?? 0) + (data.groups?.length ?? 0) > 0;
}

export type UseCommunityMessengerHomeBootstrapArgs = {
  initialServerBootstrap: CommunityMessengerBootstrap | null | undefined;
  /** 언어 전환 시 effect 재실행 없이 최신 번역만 쓰기 위한 ref */
  tRef: MutableRefObject<(key: string) => string>;
};

export type UseCommunityMessengerHomeBootstrapResult = {
  data: CommunityMessengerBootstrap | null;
  setData: Dispatch<SetStateAction<CommunityMessengerBootstrap | null>>;
  loading: boolean;
  /** critical 이전·진행 중 리스트 영역 스켈레톤 — 셸·탭은 막지 않음(APP-SHELL-FAST-PATH) */
  listAwaitingCritical: boolean;
  authRequired: boolean;
  setAuthRequired: Dispatch<SetStateAction<boolean>>;
  pageError: string | null;
  setPageError: Dispatch<SetStateAction<string | null>>;
  refresh: (silent?: boolean) => Promise<void>;
  homeRealtimeGateOpen: boolean;
  /** `deferredCallLog` 즉시 보강 — 통화 탭 진입 시 1200ms follow-up 대기 생략 */
  hydrateDeferredCallLogs: () => Promise<void>;
  /** 친구 탭 — lite/critical 에 friends 가 비었을 때 GET /friends 단일 보강 */
  hydrateMessengerFriends: () => Promise<void>;
  /** Phase2 shadow-only canonical pipeline dispatcher — UI render 입력으로 사용 금지 */
  shadowDispatch: MessengerHomeShadowDispatch;
};

/**
 * 메신저 홈 부트스트랩·사일런트 갱신·캐시 동기화·Realtime 게이트.
 * `CommunityMessengerHome` 본문(UI·액션)과 데이터 레이어 경계를 분리한다.
 */
export function useCommunityMessengerHomeBootstrap({
  initialServerBootstrap,
  tRef,
}: UseCommunityMessengerHomeBootstrapArgs): UseCommunityMessengerHomeBootstrapResult {
  useCmDevRenderTrace("useCommunityMessengerHomeBootstrap");
  const loadedRef = useRef(false);
  const silentRefreshBusyRef = useRef(false);
  const silentRefreshAgainRef = useRef(false);
  /** 사일런트 홈 sync 폭주 방지(Realtime 버스트/포커스 연속) */
  const lastSilentRefreshAtRef = useRef(0);
  /** 429(Retry-After) 시 즉시 재시도 폭주 방지 */
  const silentBackoffUntilRef = useRef(0);
  /** 사일런트 home-sync 실패 시 full bootstrap fallback 연속 호출 완화 */
  const silentFallbackFullBackoffUntilRef = useRef(0);
  /** `lastSilentRefreshAtRef` 380ms 창 안 요청은 버리지 않고 한 번만 지연 실행(방 부트스트랩과 동일 계약) */
  const silentThrottleCoalesceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** `refresh(false)` 가 Strict Mode·중복 effect 로 겹칠 때 동일 네트워크 라운드 방지 */
  const bootstrapNonSilentInFlightRef = useRef(false);
  const refreshRequestIdRef = useRef(0);
  /**
   * Cold terminal set race 방지 전용 generation.
   * non-silent cold complete bootstrap(lite/full) apply 만 이 값을 증가시킨다.
   * silent home_sync `refresh(true)` 는 `refreshRequestIdRef` 만 증가시키고 이 값은 건드리지 않으므로,
   * home_sync followup 이 아직 유효한 cold complete apply 를 stale 로 드롭하지 못한다.
   * (COLD_COMPLETE_APPLY_SUPERSEDED_BY_HOME_SYNC_REQUEST)
   */
  const bootstrapApplyGenRef = useRef(0);
  /**
   * warm-cache seed 가 full(53) tier 로 store 에 적용됐는지. critical(30)→full(53) 승격을 1회만 허용하고
   * 이후 warm-cache-ready 재발화 시 full→full 재적용·중복 dispatch 를 막는다. (applyWarmCacheIfEmpty 전용)
   */
  const warmFullSeedAppliedRef = useRef(false);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const deferredCallLogRequestIdRef = useRef(0);
  const deferredCallLogAbortRef = useRef<AbortController | null>(null);
  const friendsHydrateRequestIdRef = useRef(0);
  const friendsHydrateAbortRef = useRef<AbortController | null>(null);
  /** silent critical 직후 full 보강 — 400ms 지연·라운드 시작 시 취소 */
  const silentFullSupplementTimerRef = useRef<number | null>(null);

  /**
   * 초기 state 는 서버와 동일해야 한다 — `peekMessengerBootstrap*` 는 클라 sessionStorage 만 읽어
   * SSR 시 null·CSR 첫 렌더에 데이터가 생기며 `MessengerHomeMainSections` 트리가 달라져 하이드레이션 오류가 난다.
   * `listAwaitingCritical` 은 useLayoutEffect 에서 peek 적용 시 즉시 해제한다(APP-SHELL-FAST-PATH).
   */
  const [data, setData] = useState<CommunityMessengerBootstrap | null>(() => {
    if (initialServerBootstrap) return initialServerBootstrap;
    return peekClientStaleBootstrap();
  });
  /** 목록 새로고침 오버레이만 — 첫 critical 대기는 `listAwaitingCritical` */
  const [loading, setLoading] = useState(false);
  const [listAwaitingCritical, setListAwaitingCritical] = useState(() => {
    if (initialServerBootstrap) return false;
    if (typeof window === "undefined") return true;
    return peekClientStaleBootstrap() == null;
  });
  /** critical 페이로드 수신 후 idle 에서 연다 — 구독 attach 를 셸 직후와 분리 */
  const [homeRealtimeGateOpen, setHomeRealtimeGateOpen] = useState(
    () => Boolean(initialServerBootstrap?.me?.id)
  );
  const [authRequired, setAuthRequired] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const shadowDispatchRef = useRef<MessengerHomeShadowDispatch | null>(null);
  if (shadowDispatchRef.current == null) {
    shadowDispatchRef.current = createMessengerHomeShadowDispatch();
  }
  const shadowDispatch = shadowDispatchRef.current;

  const commitBootstrapSetData = useCallback(
    (
      prev: CommunityMessengerBootstrap | null,
      next: CommunityMessengerBootstrap | null,
      reason: string,
      prime: (bootstrap: CommunityMessengerBootstrap) => void = primeBootstrapCache
    ): CommunityMessengerBootstrap | null => {
      const resolved = resolveMessengerHomeBootstrapSetData("bootstrap", prev, next, { reason });
      if (resolved && resolved !== prev) {
        noteBootstrapUnreadIncreasesFromBootstrap(prev, resolved);
        prime(resolved);
        shadowDispatch.compareLegacy(resolved, resolved.me?.id ?? null);
      }
      return resolved;
    },
    [shadowDispatch]
  );

  /**
   * Warm/cache full-seed 를 trusted provenance 가 있을 때만 network-equivalent 로 seedComplete 시킨다(§4/§6).
   * 반드시 해당 rooms 를 canonical store 에 dispatch 한 직후·commit prime 전에 호출한다
   * (commit prime = primeMessengerBootstrapFull 이 provenance 를 clear 하므로).
   *
   * 계약:
   *  - critical provenance(30) 로는 seedComplete 금지 — final full provenance(lite/full)만 승격.
   *  - gate kill/LEGACY/version 불일치·fingerprint 불일치·이미 소비 → no-op (fail-closed).
   *  - one-shot: consume 성공 시 provenance 삭제. 단순 room count·source="cache" 만으로는 승격하지 않는다.
   */
  const seedCanonicalFromTrustedFullProvenance = useCallback(
    (rooms: readonly CommunityMessengerRoomSummary[]) => {
      const gate = peekCmHomeCutoverGate();
      if (gate.kill || gate.dispatch !== "shadow") return;
      if (!(gate.targetRead === "canonical" || gate.targetRead === "dual")) return;
      const roomIdsFingerprint = cmWarmNetworkRoomIdsFingerprint(rooms);
      const payloadFingerprint = cmWarmNetworkPayloadFingerprint(rooms);
      const provenance = consumeWarmNetworkProvenance("full", {
        gateVersion: gate.gateVersion,
        kill: gate.kill,
        dispatch: gate.dispatch,
        wantsCanonicalRead: true,
        payloadFingerprint,
        roomIdsFingerprint,
      });
      if (!provenance || provenance.tier === "critical") return;
      noteCmHomeCutoverNetworkSeed({
        source: provenance.tier,
        appliedRoomIds: rooms.map((r) => r.id),
        peekState: shadowDispatch.peekState,
      });
    },
    [shadowDispatch]
  );

  useLayoutEffect(() => {
    if (initialServerBootstrap) return;
    const fullCached = peekMessengerBootstrapFull();
    if (fullCached) {
      const fullRooms = [...(fullCached.chats ?? []), ...(fullCached.groups ?? [])];
      shadowDispatch.dispatchRoomSummaries("cache", 1, fullRooms);
      // dispatch 직후·commit prime 전에 trusted provenance 로만 seedComplete 승격(§4/§6).
      seedCanonicalFromTrustedFullProvenance(fullRooms);
      setData((prev) =>
        commitBootstrapSetData(
          prev,
          applyHomeListPatch(prev, { kind: "bootstrap_full_seed", bootstrap: fullCached }, "bootstrap"),
          "cache_full_seed"
        )
      );
      setLoading(false);
      setListAwaitingCritical(false);
      return;
    }
    const minCached = peekMessengerBootstrapMinimal();
    if (minCached) {
      shadowDispatch.dispatchRoomSummaries("cache", 1, [...(minCached.chats ?? []), ...(minCached.groups ?? [])]);
      setData((prev) =>
        commitBootstrapSetData(
          prev,
          applyHomeListPatch(prev, { kind: "bootstrap_full_seed", bootstrap: minCached }, "bootstrap"),
          "cache_minimal_seed"
        )
      );
      setLoading(false);
      setListAwaitingCritical(false);
      return;
    }
    const critCached = peekMessengerBootstrapCritical();
    if (!critCached) return;
    const critBootstrap = communityMessengerBootstrapFromCriticalPayload(critCached);
    shadowDispatch.dispatchCriticalPayload("cache", 1, critCached);
    setData((prev) =>
      commitBootstrapSetData(
        prev,
        applyHomeListPatch(prev, { kind: "bootstrap_full_seed", bootstrap: critBootstrap }, "bootstrap"),
        "cache_critical_seed"
      )
    );
    setLoading(false);
    setListAwaitingCritical(false);
  }, [commitBootstrapSetData, initialServerBootstrap, seedCanonicalFromTrustedFullProvenance, shadowDispatch]);

  useEffect(() => {
    if (initialServerBootstrap || typeof window === "undefined") return;
    const applyWarmCacheIfEmpty = () => {
      const fullPeek = peekMessengerBootstrapFull();
      const critPeek = peekMessengerBootstrapCritical();
      const dataCount = dataRef.current
        ? (dataRef.current.chats?.length ?? 0) + (dataRef.current.groups?.length ?? 0)
        : 0;
      const fullCount = fullPeek ? (fullPeek.chats?.length ?? 0) + (fullPeek.groups?.length ?? 0) : 0;
      // COLD_COMPLETE_APPLY_SUPERSEDED_BY_HOME_SYNC_REQUEST 후속:
      // warm critical(30) 이 먼저 seed 되면 뒤이어 준비된 warm full(53) 이 무조건 early-return 되어
      // store 가 30 에 고착되던 문제. 아래 계약으로 critical→full **승격 1회만** 허용한다.
      //  - full 이 이미 store 에 seed 됐으면(=warmFullSeedAppliedRef) 재적용/중복 dispatch 금지 (full→full 금지)
      //  - 이미 데이터가 있고 승격할 warm full 이 없거나 현재가 이미 full tier(count>=full)면 스킵 (critical-only 유지)
      const alreadyFullApplied = warmFullSeedAppliedRef.current;
      const skipNoUpgrade = !!dataRef.current && (!fullPeek || dataCount >= fullCount);
      if (alreadyFullApplied || skipNoUpgrade) return;
      const fullCached = fullPeek;
      const critCached = critPeek;
      const warmSeed =
        fullCached ?? (critCached ? communityMessengerBootstrapFromCriticalPayload(critCached) : null);
      if (!warmSeed) return;
      if (fullCached) {
        const fullRooms = [...(fullCached.chats ?? []), ...(fullCached.groups ?? [])];
        shadowDispatch.dispatchRoomSummaries("cache", 1, fullRooms);
        // full seed 완료 표시 — 이후 warm-cache-ready 재발화 시 full→full 재적용/중복 dispatch 방지.
        warmFullSeedAppliedRef.current = true;
        // dispatch 직후·commit prime 전에 trusted provenance 로만 seedComplete 승격(§4/§6).
        seedCanonicalFromTrustedFullProvenance(fullRooms);
      } else if (critCached) {
        shadowDispatch.dispatchCriticalPayload("cache", 1, critCached);
      }
      setData((prev) =>
        commitBootstrapSetData(
          prev,
          applyHomeListPatch(prev, { kind: "bootstrap_full_seed", bootstrap: warmSeed }, "bootstrap"),
          "warm_cache_seed"
        )
      );
      setAuthRequired(false);
      setPageError(null);
      setLoading(false);
      setListAwaitingCritical(false);
    };
    window.addEventListener("samarket:messenger-home-warm-cache-ready", applyWarmCacheIfEmpty);
    applyWarmCacheIfEmpty();
    return () => {
      window.removeEventListener("samarket:messenger-home-warm-cache-ready", applyWarmCacheIfEmpty);
    };
  }, [commitBootstrapSetData, initialServerBootstrap, seedCanonicalFromTrustedFullProvenance, shadowDispatch]);

  useLayoutEffect(() => {
    if (!getCmClientFirstPaintActiveSessionId()) return;
    markCmClientFirstPaint("room_list_state_apply_end");
    probeCmLiteFirstPaintDomIfReady();
  }, [data]);

  useEffect(() => {
    return () => {
      refreshAbortRef.current?.abort();
      deferredCallLogAbortRef.current?.abort();
      if (silentThrottleCoalesceTimerRef.current != null) {
        clearTimeout(silentThrottleCoalesceTimerRef.current);
        silentThrottleCoalesceTimerRef.current = null;
      }
      if (silentFullSupplementTimerRef.current != null) {
        clearTimeout(silentFullSupplementTimerRef.current);
        silentFullSupplementTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      samarketMessengerHomeDebugEvent("messenger_home_visibility_resume");
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  /** Multi-tab Kill 전파 수신 (control-plane 전용 BroadcastChannel). */
  useEffect(() => {
    return startCmHomeCutoverGateMultiTab();
  }, []);

  /** 서버 `deferCallLog` 분기 — `listCommunityMessengerCallLogs` 단일 왕복 */
  const mergeDeferredMessengerCallLogs = useCallback(async () => {
    const requestId = ++deferredCallLogRequestIdRef.current;
    deferredCallLogAbortRef.current?.abort();
    const controller = new AbortController();
    deferredCallLogAbortRef.current = controller;
    try {
      const res = await fetch("/api/community-messenger/bootstrap?callsLog=1", {
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestId !== deferredCallLogRequestIdRef.current) return;
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        calls?: CommunityMessengerCallLog[];
        tabs?: { calls?: number };
      };
      if (!res.ok || !json.ok) return;
      setData((prev) => {
        if (!prev) return prev;
        const nextCalls = json.calls ?? prev.calls;
        const nextCallsTab = json.tabs?.calls ?? prev.tabs.calls;
        const { deferredCallLog: _omit, ...rest } = prev;
        void _omit;
        const merged: CommunityMessengerBootstrap = {
          ...rest,
          calls: nextCalls,
          tabs: { ...rest.tabs, calls: nextCallsTab },
        };
        const resolved = resolveMessengerHomeBootstrapSetData("deferred-calls", prev, merged, {
          reason: "deferred_call_log",
        });
        if (resolved && resolved !== prev) primeBootstrapCache(resolved);
        return resolved;
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      /* ignore */
    } finally {
      if (deferredCallLogAbortRef.current === controller) {
        deferredCallLogAbortRef.current = null;
      }
    }
  }, []);

  const applyHomeSyncPayload = useCallback(
    (
      payload: {
        chats?: CommunityMessengerBootstrap["chats"];
        groups?: CommunityMessengerBootstrap["groups"];
        requests?: CommunityMessengerBootstrap["requests"];
        friends?: CommunityMessengerBootstrap["friends"];
      },
      roomMode: "replace" | "critical_patch" | "partial_upsert" = "replace"
    ) => {
      const skipPayload = { ...payload, roomMode };
      setData((prev) => {
        const cache = peekBootstrapCache();
        const base = prev ?? cache;
        if (!base) return prev;
        const needsReactSync = homeSyncPayloadNeedsReactUnreadSync(skipPayload, prev, cache);
        const forceApply =
          needsReactSync || homeSyncPayloadHasUnreadIncreaseAgainstBase(skipPayload, base);
        if (!forceApply && shouldSkipHomeSyncPayload(skipPayload, { reactBase: prev })) return prev;
        const tUiAlign0 = typeof performance !== "undefined" ? performance.now() : null;
        try {
          const next = applyHomeListPatch(
            base,
            {
              kind: "home_sync",
              chats: payload.chats,
              groups: payload.groups,
              requests: payload.requests,
              friends: payload.friends,
              roomMode,
            },
            "home-sync"
          );
          const stats = peekLastHomeListPatchStats();
          const criticalChangedFields = stats?.criticalChangedFields;
          const firstChangedRoomId =
            criticalChangedFields && Object.keys(criticalChangedFields).length > 0
              ? Object.keys(criticalChangedFields)[0]
              : payload.chats?.[0]?.id ?? payload.groups?.[0]?.id;
          let candidate: CommunityMessengerBootstrap | null =
            !next || next === base ? null : next;
          if (!candidate && needsReactSync && prev) {
            const retried = applyHomeListPatch(
              prev,
              {
                kind: "home_sync",
                chats: payload.chats,
                groups: payload.groups,
                requests: payload.requests,
                friends: payload.friends,
                roomMode,
              },
              "home-sync"
            );
            if (retried && retried !== prev) candidate = retried;
          }
          if (!candidate && needsReactSync && prev == null && cache) {
            candidate = cache;
          }
          const resolved = resolveMessengerHomeBootstrapSetData(
            "home-sync",
            prev,
            candidate ?? prev,
            {
              reason: `home_sync_patch:${roomMode}`,
              changedRoomCount: stats?.changedRoomCount ?? 0,
              criticalChangedFields,
              roomId: firstChangedRoomId,
            }
          );
          if (!resolved || resolved === prev) return prev;
          const generation = refreshRequestIdRef.current || 1;
          const appliedRooms = [...(resolved.chats ?? []), ...(resolved.groups ?? [])];
          shadowDispatch.dispatchRoomSummaries("home_sync", generation, appliedRooms);
          noteCmHomeCutoverNetworkSeed({
            source: "home_sync",
            appliedRoomIds: appliedRooms.map((r) => r.id),
            peekState: shadowDispatch.peekState,
          });
          noteBootstrapUnreadIncreasesFromBootstrap(prev, resolved);
          primeBootstrapCache(resolved);
          shadowDispatch.compareLegacy(resolved, resolved.me?.id ?? null);
          noteHomeSyncPayloadFlushed({ ...payload, roomMode });
          return resolved;
        } finally {
          if (tUiAlign0 != null && typeof performance !== "undefined") {
            messengerMonitorHomeListBootstrapUiAlign(Math.round(performance.now() - tUiAlign0));
          }
        }
      });
    },
    [shadowDispatch]
  );

  useEffect(() => {
    registerDeferredHomeSyncRunner((payload) => {
      applyHomeSyncPayload(payload, payload.roomMode ?? "replace");
    });
  }, [applyHomeSyncPayload]);

  const mergeHomeSyncIntoBootstrap = useCallback(
    (
      payload: {
        chats?: CommunityMessengerBootstrap["chats"];
        groups?: CommunityMessengerBootstrap["groups"];
        requests?: CommunityMessengerBootstrap["requests"];
        friends?: CommunityMessengerBootstrap["friends"];
      },
      roomMode: "replace" | "critical_patch" | "partial_upsert" = "replace"
    ) => {
      const wrapped = { ...payload, roomMode };
      if (deferHomeSyncPatchDuringLiteMerge(wrapped)) return;
      const apply = () => applyHomeSyncPayload(payload, roomMode);
      const needsSync = homeSyncPayloadNeedsReactUnreadSync(
        wrapped,
        dataRef.current,
        peekBootstrapCache()
      );
      if (needsSync) {
        apply();
        return;
      }
      const run = () => deferHomeSyncMerge(apply);
      if (shouldDeferDuringRoomEntryQuiet(run)) return;
      run();
    },
    [applyHomeSyncPayload]
  );

  const parseBootstrapJson = useCallback(
    async <T,>(res: Response): Promise<T> => {
      const json = (await res.json().catch(() => ({}))) as T;
      recordMessengerBootstrapJsonParseComplete();
      // 각 실제 네트워크 응답에서 dispatch 전에 Runtime Gate overlay 를 먼저 적용한다(§7).
      // 적용 후 runtimeMeta 는 제거 — sessionStorage/캐시 payload 에 gate 상태를 남기지 않는다(§6).
      if (json && typeof json === "object" && "runtimeMeta" in (json as object)) {
        applyCmHomeCutoverGateFromResponseJson(json);
        delete (json as Record<string, unknown>).runtimeMeta;
      }
      return json;
    },
    []
  );

  const refresh = useCallback(async (silent = false) => {
    recordMessengerHomeRefreshInvocation(silent);
    if (silent && isDevSafeMode()) return;
    if (!tryEnterHomeBootstrapRefreshRound(silent)) return;
    let refreshRoundFinished = false;
    const endRefreshRound = (onPendingSilent: () => void) => {
      if (refreshRoundFinished) return;
      refreshRoundFinished = true;
      finishHomeBootstrapRefreshRound(onPendingSilent);
    };
    if (silent) {
      const now = Date.now();
      if (now < silentBackoffUntilRef.current) {
        endRefreshRound(() => {
          void refresh(true);
        });
        return;
      }
      if (now - lastSilentRefreshAtRef.current < HOME_SILENT_REFRESH_MIN_GAP_MS) {
        if (silentThrottleCoalesceTimerRef.current != null) clearTimeout(silentThrottleCoalesceTimerRef.current);
        silentThrottleCoalesceTimerRef.current = setTimeout(() => {
          silentThrottleCoalesceTimerRef.current = null;
          void refresh(true);
        }, Math.max(1, HOME_SILENT_REFRESH_MIN_GAP_MS - (Date.now() - lastSilentRefreshAtRef.current)));
        endRefreshRound(() => {
          void refresh(true);
        });
        return;
      }
      if (silentThrottleCoalesceTimerRef.current != null) {
        clearTimeout(silentThrottleCoalesceTimerRef.current);
        silentThrottleCoalesceTimerRef.current = null;
      }
      lastSilentRefreshAtRef.current = now;
    }
    if (!tryEnterSilentRefreshRound(silent, silentRefreshBusyRef, silentRefreshAgainRef)) {
      endRefreshRound(() => {
        void refresh(true);
      });
      return;
    }
    if (!silent && bootstrapNonSilentInFlightRef.current) {
      samarketMessengerHomeDebugEvent("messenger_home_refresh_skip_non_silent_inflight");
      endRefreshRound(() => {});
      return;
    }
    if (!silent) {
      bootstrapNonSilentInFlightRef.current = true;
    }
    const requestId = ++refreshRequestIdRef.current;
    // non-silent cold complete bootstrap 만 apply-gen 을 올린다. silent home_sync 는 올리지 않는다.
    const bootstrapApplyGen = silent
      ? bootstrapApplyGenRef.current
      : ++bootstrapApplyGenRef.current;
    refreshAbortRef.current?.abort();
    if (silentFullSupplementTimerRef.current != null) {
      clearTimeout(silentFullSupplementTimerRef.current);
      silentFullSupplementTimerRef.current = null;
    }
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    samarketMessengerHomeDebugEvent("messenger_home_refresh_start", { silent });
    let refreshDataOk = false;
    let bootstrapClientOk = false;
    const staleFullOnly = !silent ? peekMessengerBootstrapFull() : null;
    const staleCritPayload = !silent ? peekMessengerBootstrapCritical() : null;
    const stale: CommunityMessengerBootstrap | null =
      staleFullOnly ??
      (staleCritPayload ? communityMessengerBootstrapFromCriticalPayload(staleCritPayload) : null);
    const shouldBlock = !silent && !loadedRef.current && !stale;
    const useLiteBootstrapFallback = !silent && !stale && !loadedRef.current;
    if (stale) {
      if (staleFullOnly) {
        const staleFullRooms = [...(staleFullOnly.chats ?? []), ...(staleFullOnly.groups ?? [])];
        shadowDispatch.dispatchRoomSummaries("cache", requestId, staleFullRooms);
        // dispatch 직후·commit prime 전에 trusted provenance 로만 seedComplete 승격(§4/§6).
        seedCanonicalFromTrustedFullProvenance(staleFullRooms);
      } else if (staleCritPayload) {
        shadowDispatch.dispatchCriticalPayload("cache", requestId, staleCritPayload);
      }
      setData((prev) => {
        const seeded = commitBootstrapSetData(
          prev,
          applyHomeListPatch(prev, { kind: "bootstrap_full_seed", bootstrap: stale }, "bootstrap"),
          "refresh_stale_seed"
        );
        return seeded;
      });
      setAuthRequired(false);
      setPageError(null);
      setListAwaitingCritical(false);
    }
    if (!silent && stale) setLoading(true);
    if (!silent && !stale && !homeBootstrapHasListRooms(dataRef.current)) {
      setListAwaitingCritical(true);
    }
    try {
      if (silent) {
        shadowDispatch.markSilentRefreshStarted();
        if (shouldDeferHomeSyncStart()) {
          finishSilentRefreshRound(silent, silentRefreshBusyRef, silentRefreshAgainRef, () => {});
          endRefreshRound(() => {
            void refresh(true);
          });
          return;
        }
        const tHomeSyncFetch0 = typeof performance !== "undefined" ? performance.now() : null;
        const { res, json } = await fetchCommunityMessengerHomeSilentLists({
          signal: controller.signal,
          tier: "critical",
        });
        if (tHomeSyncFetch0 != null && typeof performance !== "undefined") {
          messengerMonitorHomeSyncFetchMs(Math.round(performance.now() - tHomeSyncFetch0));
        }
        if (controller.signal.aborted || requestId !== refreshRequestIdRef.current) return;
        if (res.status === 429) {
          const ra = res.headers.get("Retry-After");
          const sec = Math.min(120, Math.max(1, Number.parseInt(ra ?? "", 10) || 5));
          silentBackoffUntilRef.current = Date.now() + sec * 1000;
        }
        if (res.ok && json.ok) {
          refreshDataOk = true;
          const silentCriticalPayload = {
            chats: json.chats ?? [],
            groups: json.groups ?? [],
          };
          mergeHomeSyncIntoBootstrap(silentCriticalPayload, "critical_patch");
          silentFullSupplementTimerRef.current = window.setTimeout(() => {
            silentFullSupplementTimerRef.current = null;
            void (async () => {
              if (controller.signal.aborted || requestId !== refreshRequestIdRef.current) return;
              try {
                const { res: resFull, json: jsonFull } = await fetchCommunityMessengerHomeSilentLists({
                  signal: controller.signal,
                  tier: "full",
                });
                if (controller.signal.aborted || requestId !== refreshRequestIdRef.current) return;
                if (resFull.ok && jsonFull.ok) {
                  const silentFullPayload = {
                    chats: jsonFull.chats ?? [],
                    groups: jsonFull.groups ?? [],
                    requests: jsonFull.requests,
                    friends: jsonFull.friends,
                  };
                  mergeHomeSyncIntoBootstrap(silentFullPayload, "partial_upsert");
                }
              } catch {
                /* ignore */
              }
            })();
          }, 400);
        } else {
          const unauthorized = res.status === 401 || res.status === 403;
          if (unauthorized) {
            clearBootstrapCache();
            setAuthRequired(true);
            setPageError(tRef.current("nav_messenger_login_required"));
            setData(null);
            setListAwaitingCritical(false);
          } else {
            if (Date.now() < silentFallbackFullBackoffUntilRef.current) {
              return;
            }
            samarketMessengerHomeDebugEvent("messenger_home_bootstrap_start", { mode: "fresh" });
            const tSilentFallback0 = typeof performance !== "undefined" ? performance.now() : null;
            const resFull = await fetchCommunityMessengerBootstrapClient("fresh", { signal: controller.signal });
            if (tSilentFallback0 != null && typeof performance !== "undefined") {
              messengerMonitorSilentFailFallbackBootstrapMs(Math.round(performance.now() - tSilentFallback0));
            }
            if (controller.signal.aborted || requestId !== refreshRequestIdRef.current) return;
            const jsonFull = await parseBootstrapJson<CommunityMessengerBootstrap & {
              ok?: boolean;
              error?: string;
            }>(resFull);
            if (resFull.ok && jsonFull.ok) {
              samarketMessengerHomeDebugEvent("messenger_home_bootstrap_success", { mode: "fresh" });
              refreshDataOk = true;
              silentFallbackFullBackoffUntilRef.current = 0;
              const next: CommunityMessengerBootstrap = {
                me: jsonFull.me ?? null,
                tabs: {
                  friends: jsonFull.tabs?.friends ?? 0,
                  chats: jsonFull.tabs?.chats ?? 0,
                  groups: jsonFull.tabs?.groups ?? 0,
                  calls: jsonFull.tabs?.calls ?? 0,
                },
                friends: jsonFull.friends ?? [],
                following: jsonFull.following ?? [],
                hidden: jsonFull.hidden ?? [],
                blocked: jsonFull.blocked ?? [],
                requests: jsonFull.requests ?? [],
                chats: jsonFull.chats ?? [],
                groups: jsonFull.groups ?? [],
                discoverableGroups: jsonFull.discoverableGroups ?? [],
                calls: jsonFull.calls ?? [],
              };
              shadowDispatch.dispatchRoomSummaries("full", requestId, [
                ...(next.chats ?? []),
                ...(next.groups ?? []),
              ]);
              noteCmHomeCutoverNetworkSeed({
                source: "full",
                appliedRoomIds: [...(next.chats ?? []), ...(next.groups ?? [])].map((r) => r.id),
                peekState: shadowDispatch.peekState,
              });
              setAuthRequired(false);
              setPageError(null);
              setData((prev) => {
                const merged = applyHomeListPatch(
                  prev,
                  { kind: "bootstrap_apply_full", next, mergeStaleOutgoingRequests: true },
                  "bootstrap"
                );
                const candidate = merged ?? next;
                return commitBootstrapSetData(prev, candidate, "silent_fallback_full");
              });
              if ((next.discoverableGroups?.length ?? 0) === 0) {
                const schSf = getMessengerBackgroundHydrationScheduler();
                const silentFbId = requestId;
                window.setTimeout(() => {
                  if (silentFbId !== refreshRequestIdRef.current) return;
                  schSf.schedule({
                    id: `messenger:silent-fallback:discover-fill:${silentFbId}`,
                    dedupeKey: "messenger:silent-fallback:discover-fill",
                    priority: "low",
                    run: async () => {
                      await mergeDiscoverableGroupsFromOpenGroupsClient(setData, "fill_if_empty");
                    },
                  });
                }, 1800);
              }
            } else {
              silentFallbackFullBackoffUntilRef.current = Date.now() + 1200;
            }
          }
        }
      } else {
        /** 비-silent: critical-first → idle 에서 lite 보강 (첫 페인트 전 full 단일 await 제거) */
        markCmBootstrapV2ClientFlowAnchor();
        const shellVisibleAt = typeof performance !== "undefined" ? performance.now() : 0;

        const armPostBootstrapFollowUps = (
          hydrateRequestId: number,
          bootstrap: CommunityMessengerBootstrap
        ) => {
          if (isDevSafeMode()) return;
          const sch = getMessengerBackgroundHydrationScheduler();
          const armFollowUp = (delayMs: number, enqueue: () => void) => {
            if (typeof window === "undefined") return;
            window.setTimeout(() => {
              if (hydrateRequestId !== refreshRequestIdRef.current) return;
              enqueue();
            }, delayMs);
          };
          armFollowUp(250, () => {
            if (shouldDeferPostLiteFollowUp()) return;
            sch.schedule({
              id: `messenger:followup:silent-refresh:${hydrateRequestId}`,
              dedupeKey: "messenger:followup:silent-refresh",
              priority: "low",
              run: async () => {
                await refresh(true);
              },
            });
          });
          if (bootstrap.deferredCallLog) {
            armFollowUp(1200, () => {
              if (shouldDeferPostLiteFollowUp()) return;
              sch.schedule({
                id: `messenger:followup:calls-log:${hydrateRequestId}`,
                dedupeKey: "messenger:followup:calls-log",
                priority: "low",
                run: async () => {
                  await mergeDeferredMessengerCallLogs();
                },
              });
            });
          }
          armFollowUp(1800, () => {
            if (shouldDeferPostLiteFollowUp()) return;
            sch.schedule({
              id: `messenger:followup:discoverable:${hydrateRequestId}`,
              dedupeKey: "messenger:followup:discoverable-open-groups",
              priority: "low",
              run: async () => {
                await mergeDiscoverableGroupsFromOpenGroupsClient(setData, "replace");
              },
            });
          });
        };

        const scheduleDeferredLiteAndLog = (
          criticalRequestStartAt: number,
          criticalResponseAt: number,
          roomListVisibleAt: number,
          usedCachedSnapshot: boolean,
          usedCriticalPayload: boolean
        ) => {
          if (isDevSafeMode()) return;
          const sch = getMessengerBackgroundHydrationScheduler();
          const hydrateRequestId = requestId;

          scheduleMessengerDeferredOnIdle(() => {
            sch.schedule({
            id: `messenger:deferred-lite-bootstrap:${hydrateRequestId}`,
            dedupeKey: "messenger:deferred-lite-bootstrap",
            priority: "medium",
            run: async (signal) => {
              logMessengerDeferredStart();
              const deferredStartAt = typeof performance !== "undefined" ? performance.now() : 0;
              let deferredFinishAt = deferredStartAt;
              try {
                samarketMessengerHomeDebugEvent("messenger_home_bootstrap_start", { mode: "lite" });
                const mergedSignal = abortSignalAny([controller.signal, signal]);
                const resLite = await fetchCommunityMessengerBootstrapClient("lite", {
                  signal: mergedSignal,
                });
                const coldLiteApply = shouldApplyColdBootstrapComplete({
                  capturedApplyGen: bootstrapApplyGen,
                  currentApplyGen: bootstrapApplyGenRef.current,
                  aborted: controller.signal.aborted,
                });
                if (!coldLiteApply) {
                  return;
                }
                const jsonLite = await parseBootstrapJson<CommunityMessengerBootstrap & {
                  ok?: boolean;
                  error?: string;
                  deferredCallLog?: boolean;
                }>(resLite);
                if (resLite.ok && jsonLite.ok) {
                  bootstrapClientOk = true;
                  refreshDataOk = true;
                  samarketMessengerHomeDebugEvent("messenger_home_bootstrap_success", { mode: "lite" });
                  const next = messengerBootstrapFromLiteApiJson(jsonLite);
                  shadowDispatch.dispatchRoomSummaries("lite", hydrateRequestId, [
                    ...(next.chats ?? []),
                    ...(next.groups ?? []),
                  ]);
                  noteCmHomeCutoverNetworkSeed({
                    source: "lite",
                    appliedRoomIds: [...(next.chats ?? []), ...(next.groups ?? [])].map((r) => r.id),
                    peekState: shadowDispatch.peekState,
                  });
                  const responseAt =
                    typeof performance !== "undefined" ? performance.now() : 0;
                  resetCmClientMergeBreakdown(true);
                  anchorCmClientMergeBreakdownFromResponse(responseAt);
                  markCmClientFirstPaint("bootstrap_response_received");
                  primeMessengerBootstrapMinimal(next);
                  markCmClientFirstPaint("room_list_state_apply_start");
                  markCmClientMergeStart();
                  const tStore0 = typeof performance !== "undefined" ? performance.now() : 0;
                  unstable_batchedUpdates(() => {
                    setAuthRequired(false);
                    setPageError(null);
                    setData((prev) => {
                      const merged = applyHomeListPatch(
                        prev,
                        { kind: "bootstrap_apply_full", next, mergeStaleOutgoingRequests: true },
                        "bootstrap"
                      );
                      const stats = peekLastHomeListPatchStats();
                      if (stats) recordCmClientMergePatchStats(stats);
                      const candidate = merged ?? prev ?? next;
                      return commitBootstrapSetData(prev, candidate, "deferred_lite_bootstrap", primeMessengerBootstrapFull);
                    });
                  });
                  recordCmClientMergeStoreEmitMs(
                    typeof performance !== "undefined" ? Math.round(performance.now() - tStore0) : 0
                  );
                  runAfterLiteClientMergePaint(completeLiteClientMergeAfterPaint);
                  deferredFinishAt = typeof performance !== "undefined" ? performance.now() : 0;
                  armPostBootstrapFollowUps(hydrateRequestId, next);
                } else {
                  const unauthorized = resLite.status === 401 || resLite.status === 403;
                  if (unauthorized) {
                    clearBootstrapCache();
                    setAuthRequired(true);
                    setPageError(tRef.current("nav_messenger_login_required"));
                    setData(null);
                    setListAwaitingCritical(false);
                  } else {
                    setAuthRequired(false);
                    setPageError(tRef.current("nav_messenger_load_failed"));
                    if (!stale) {
                      setData(null);
                      setListAwaitingCritical(false);
                    }
                  }
                }
              } catch {
                /* ignore */
              } finally {
                if (isLiteClientMergeGateActive()) {
                  endLiteClientMergeGate();
                  markLiteMergeFollowUpsUnblocked();
                }
                logCmBootstrapV2ClientFinalize({
                  shellVisibleAt,
                  criticalRequestStartAt,
                  criticalResponseAt,
                  roomListVisibleAt,
                  deferredStartAt,
                  deferredFinishAt,
                  used_cached_snapshot: usedCachedSnapshot,
                  used_critical_payload: usedCriticalPayload,
                });
                logMessengerDeferredDone();
              }
            },
          });
          });
        };

        if (staleFullOnly) {
          refreshDataOk = true;
          bootstrapClientOk = true;
          logCmBootstrapV2ClientFinalize({
            shellVisibleAt,
            criticalRequestStartAt: shellVisibleAt,
            criticalResponseAt: shellVisibleAt,
            roomListVisibleAt: shellVisibleAt,
            deferredStartAt: shellVisibleAt,
            deferredFinishAt: shellVisibleAt,
            used_cached_snapshot: true,
            used_critical_payload: false,
          });
          armPostBootstrapFollowUps(requestId, staleFullOnly);
        } else if (staleCritPayload) {
          scheduleDeferredLiteAndLog(shellVisibleAt, shellVisibleAt, shellVisibleAt, true, true);
        } else {
          try {
            const criticalRequestStartAt = typeof performance !== "undefined" ? performance.now() : 0;
            const resCrit = await fetchCommunityMessengerBootstrapCriticalClient({ signal: controller.signal });
            const criticalResponseAt = typeof performance !== "undefined" ? performance.now() : 0;
            const critical_fetch_ms =
              typeof performance !== "undefined" ? Math.round(criticalResponseAt - criticalRequestStartAt) : 0;
            if (controller.signal.aborted) {
              logFetchClientTelemetry("fetch_abort", {
                fetch_abort_url: "/api/community-messenger/bootstrap?tier=critical",
                fetch_abort_reason: "signal_aborted",
                fetch_abort_after_route_change: true,
              });
              return;
            }
            if (requestId !== refreshRequestIdRef.current) {
              logFetchClientTelemetry("stale_response_ignored", {
                stale_response_ignored: true,
                fetch_abort_after_route_change: true,
                stage: "after_critical_fetch",
                request_id: requestId,
                current_id: refreshRequestIdRef.current,
              });
              return;
            }
            const tParseCrit0 = typeof performance !== "undefined" ? performance.now() : 0;
            const jsonCrit = await parseBootstrapJson<
              CommunityMessengerBootstrapCritical & { ok?: boolean; error?: string }
            >(resCrit);
            const critical_json_parse_ms =
              typeof performance !== "undefined" ? Math.round(performance.now() - tParseCrit0) : 0;
            if (resCrit.ok && jsonCrit.ok && jsonCrit.tier === "critical") {
              const tApplyCrit0 = typeof performance !== "undefined" ? performance.now() : 0;
              primeMessengerBootstrapCritical(jsonCrit);
              // critical 은 Canonical ingest(dispatch)까지만 허용 — seedComplete 는 완료하지 않는다(§3).
              // partial(30) room set 로 read 를 canonical 로 전환하면 안 되므로 seed note 는 final full 에서만.
              shadowDispatch.dispatchCriticalPayload("critical", requestId, jsonCrit);
              const partial = communityMessengerBootstrapFromCriticalPayload(jsonCrit);
              refreshDataOk = true;
              setAuthRequired(false);
              setPageError(null);
              setData((prev) =>
                commitBootstrapSetData(
                  prev,
                  applyHomeListPatch(
                    prev,
                    { kind: "bootstrap_full_seed", bootstrap: partial },
                    "bootstrap"
                  ),
                  "critical_bootstrap_seed"
                )
              );
              setListAwaitingCritical(false);
              const critical_state_apply_ms =
                typeof performance !== "undefined" ? Math.round(performance.now() - tApplyCrit0) : 0;
              logMessengerCriticalDone();
              const tApplyCritEnd = typeof performance !== "undefined" ? performance.now() : 0;
              const hdrKb = resCrit.headers.get("x-samarket-critical-payload-kb");
              const hdrRoute = resCrit.headers.get("x-samarket-critical-route-ms");
              const hdrSer = resCrit.headers.get("x-samarket-critical-serialization-ms");
              const hdrRooms = resCrit.headers.get("x-samarket-critical-room-count");
              const critical_payload_kb = hdrKb != null && hdrKb !== "" ? Number(hdrKb) : null;
              if (
                typeof window !== "undefined" &&
                typeof performance !== "undefined" &&
                messengerVerboseTraceConsoleEnabled()
              ) {
                queueMicrotask(() => {
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      const critical_render_commit_ms = Math.round(performance.now() - tApplyCritEnd);
                      const critical_first_list_visible_ms = Math.round(performance.now() - criticalRequestStartAt);
                      // eslint-disable-next-line no-console -- gated critical bootstrap client
                      console.debug(
                        "[critical-bootstrap-client]",
                        JSON.stringify({
                          critical_fetch_ms,
                          critical_json_parse_ms,
                          critical_state_apply_ms,
                          critical_first_list_visible_ms,
                          critical_render_commit_ms,
                          critical_payload_kb: Number.isFinite(critical_payload_kb) ? critical_payload_kb : null,
                          critical_server_route_ms:
                            hdrRoute != null && hdrRoute !== "" ? Number(hdrRoute) : null,
                          critical_server_serialization_ms:
                            hdrSer != null && hdrSer !== "" ? Number(hdrSer) : null,
                          critical_server_room_count:
                            hdrRooms != null && hdrRooms !== "" ? Number(hdrRooms) : null,
                          tier: "critical",
                        })
                      );
                    });
                  });
                });
              }
              scheduleDeferredLiteAndLog(
                criticalRequestStartAt,
                criticalResponseAt,
                typeof performance !== "undefined" ? performance.now() : 0,
                false,
                true
              );
            } else {
              throw new Error("critical_bootstrap_not_ok");
            }
          } catch {
            samarketMessengerHomeDebugEvent("messenger_home_bootstrap_start", {
              mode: useLiteBootstrapFallback ? "lite" : "full",
            });
            const res = await fetchCommunityMessengerBootstrapClient(useLiteBootstrapFallback ? "lite" : "full", {
              signal: controller.signal,
            });
            const coldFallbackApply = shouldApplyColdBootstrapComplete({
              capturedApplyGen: bootstrapApplyGen,
              currentApplyGen: bootstrapApplyGenRef.current,
              aborted: controller.signal.aborted,
            });
            if (!coldFallbackApply) {
              return;
            }
            const json = await parseBootstrapJson<CommunityMessengerBootstrap & {
              ok?: boolean;
              error?: string;
              deferredCallLog?: boolean;
            }>(res);
            if (res.ok && json.ok) {
              bootstrapClientOk = true;
              refreshDataOk = true;
              samarketMessengerHomeDebugEvent("messenger_home_bootstrap_success", {
                mode: useLiteBootstrapFallback ? "lite" : "full",
              });
              const next = messengerBootstrapFromLiteApiJson(json);
              shadowDispatch.dispatchRoomSummaries(useLiteBootstrapFallback ? "lite" : "full", requestId, [
                ...(next.chats ?? []),
                ...(next.groups ?? []),
              ]);
              noteCmHomeCutoverNetworkSeed({
                source: useLiteBootstrapFallback ? "lite" : "full",
                appliedRoomIds: [...(next.chats ?? []), ...(next.groups ?? [])].map((r) => r.id),
                peekState: shadowDispatch.peekState,
              });
              if (useLiteBootstrapFallback) {
                const responseAt =
                  typeof performance !== "undefined" ? performance.now() : 0;
                markCmClientFirstPaint("bootstrap_response_received");
                resetCmClientMergeBreakdown();
                anchorCmClientMergeBreakdownFromResponse(responseAt);
              }
              logMessengerCriticalDone();
              const tStoreFb0 = typeof performance !== "undefined" ? performance.now() : 0;
              unstable_batchedUpdates(() => {
                setListAwaitingCritical(false);
                setAuthRequired(false);
                setPageError(null);
                if (useLiteBootstrapFallback) {
                  markCmClientFirstPaint("room_list_state_apply_start");
                  markCmClientMergeStart();
                }
                setData((prev) => {
                  const merged = applyHomeListPatch(
                    prev,
                    { kind: "bootstrap_apply_full", next, mergeStaleOutgoingRequests: true },
                    "bootstrap"
                  );
                  const stats = peekLastHomeListPatchStats();
                  if (stats) recordCmClientMergePatchStats(stats);
                  const candidate = merged ?? prev ?? next;
                  return commitBootstrapSetData(prev, candidate, "bootstrap_apply_full", primeMessengerBootstrapFull);
                });
              });
              if (useLiteBootstrapFallback) {
                recordCmClientMergeStoreEmitMs(
                  typeof performance !== "undefined" ? Math.round(performance.now() - tStoreFb0) : 0
                );
                runAfterLiteClientMergePaint(completeLiteClientMergeAfterPaint);
              }
              const fallbackLogAt = typeof performance !== "undefined" ? performance.now() : 0;
              logCmBootstrapV2ClientFinalize({
                shellVisibleAt,
                criticalRequestStartAt: shellVisibleAt,
                criticalResponseAt: fallbackLogAt,
                roomListVisibleAt: fallbackLogAt,
                deferredStartAt: fallbackLogAt,
                deferredFinishAt: fallbackLogAt,
                used_cached_snapshot: false,
                used_critical_payload: false,
              });
              if (useLiteBootstrapFallback) {
                const schFb = getMessengerBackgroundHydrationScheduler();
                const fbId = requestId;
                const armFb = (delayMs: number, enqueue: () => void) => {
                  if (typeof window === "undefined") return;
                  window.setTimeout(() => {
                    if (fbId !== refreshRequestIdRef.current) return;
                    enqueue();
                  }, delayMs);
                };
                armFb(250, () => {
                  schFb.schedule({
                    id: `messenger:fallback:followup:silent:${fbId}`,
                    dedupeKey: "messenger:followup:silent-refresh",
                    priority: "low",
                    run: async () => {
                      await refresh(true);
                    },
                  });
                });
                if (next.deferredCallLog) {
                  armFb(1200, () => {
                    schFb.schedule({
                      id: `messenger:fallback:followup:calls:${fbId}`,
                      dedupeKey: "messenger:followup:calls-log",
                      priority: "low",
                      run: async () => {
                        await mergeDeferredMessengerCallLogs();
                      },
                    });
                  });
                }
                armFb(1800, () => {
                  schFb.schedule({
                    id: `messenger:fallback:followup:discover:${fbId}`,
                    dedupeKey: "messenger:followup:discoverable-open-groups",
                    priority: "low",
                    run: async () => {
                      await mergeDiscoverableGroupsFromOpenGroupsClient(setData, "replace");
                    },
                  });
                });
              } else if ((next.discoverableGroups?.length ?? 0) === 0) {
                const schFill = getMessengerBackgroundHydrationScheduler();
                const fillId = requestId;
                window.setTimeout(() => {
                  if (fillId !== refreshRequestIdRef.current) return;
                  schFill.schedule({
                    id: `messenger:fallback:discoverable-fill:${fillId}`,
                    dedupeKey: "messenger:fallback:discoverable-fill",
                    priority: "low",
                    run: async () => {
                      await mergeDiscoverableGroupsFromOpenGroupsClient(setData, "fill_if_empty");
                    },
                  });
                }, 1800);
              }
            } else {
              const unauthorized = res.status === 401 || res.status === 403;
              if (unauthorized) {
                clearBootstrapCache();
                setAuthRequired(true);
                setPageError(tRef.current("nav_messenger_login_required"));
                setData(null);
                setListAwaitingCritical(false);
              } else {
                setAuthRequired(false);
                setPageError(tRef.current("nav_messenger_load_failed"));
                if (!silent && !stale) {
                  setData(null);
                  setListAwaitingCritical(false);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        logFetchClientTelemetry("fetch_abort", {
          fetch_abort_url: "messenger_home_refresh",
          fetch_abort_reason: "AbortError",
          fetch_abort_after_route_change: true,
        });
        return;
      }
      if (isLikelyFetchAbortError(error, controller.signal)) {
        logFetchClientTelemetry("fetch_abort", {
          fetch_abort_url: "messenger_home_refresh",
          fetch_abort_reason: error instanceof Error ? error.message : "unknown",
          fetch_abort_after_route_change: true,
        });
        return;
      }
      if (!silent) {
        setAuthRequired(false);
        setPageError(tRef.current("nav_messenger_load_failed"));
        if (!stale) {
          setData(null);
          setListAwaitingCritical(false);
        }
      }
    } finally {
      if (refreshAbortRef.current === controller) {
        refreshAbortRef.current = null;
      }
      if (refreshDataOk) {
        samarketMessengerHomeDebugEvent("messenger_home_refresh_success", {
          silent,
          bootstrapClientOk,
        });
      }
      if (!silent) {
        bootstrapNonSilentInFlightRef.current = false;
      }
      finishSilentRefreshRound(silent, silentRefreshBusyRef, silentRefreshAgainRef, () => {
        void refresh(true);
      });
      if (silent) {
        shadowDispatch.markSilentRefreshSettled();
      }
      endRefreshRound(() => {
        void refresh(true);
      });
      loadedRef.current = true;
      shadowDispatch.markBootstrapSettled();
      if (!silent) {
        setLoading(false);
      }
      if (shouldBlock) {
        setListAwaitingCritical(false);
      }
    }
    // tRef.current 만 읽음 — 언어 전환 시에도 동일 refresh 인스턴스 유지
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tRef 안정 참조
  }, [
    mergeDeferredMessengerCallLogs,
    mergeHomeSyncIntoBootstrap,
    parseBootstrapJson,
    seedCanonicalFromTrustedFullProvenance,
    shadowDispatch,
  ]);

  /** `refresh` 콜백 참조가 바뀌어도 초기 마운트 부트스트랩 effect 가 재실행·중복 fetch 되지 않게 */
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (initialServerBootstrap) {
      shadowDispatch.dispatchRoomSummaries("full", 1, [
        ...(initialServerBootstrap.chats ?? []),
        ...(initialServerBootstrap.groups ?? []),
      ]);
      // RSC 초기 주입은 runtimeMeta 가 없어 Gate 는 legacy 유지 → seed note 는 no-op(승격 없음, §7 warm 규칙).
      noteCmHomeCutoverNetworkSeed({
        source: "full",
        appliedRoomIds: [...(initialServerBootstrap.chats ?? []), ...(initialServerBootstrap.groups ?? [])].map(
          (r) => r.id
        ),
        peekState: shadowDispatch.peekState,
      });
      shadowDispatch.compareLegacy(initialServerBootstrap, initialServerBootstrap.me?.id ?? null);
      primeBootstrapCache(initialServerBootstrap);
      loadedRef.current = true;
      shadowDispatch.markBootstrapSettled();
      setAuthRequired(false);
      setPageError(null);
      if (initialServerBootstrap.deferredCallLog && !isDevSafeMode()) {
        scheduleMessengerDeferredOnIdle(() => {
          getMessengerBackgroundHydrationScheduler().schedule({
            id: "messenger:ssr-deferred:calls-log",
            dedupeKey: "messenger:followup:calls-log",
            priority: "low",
            run: async () => {
              await mergeDeferredMessengerCallLogs();
            },
          });
        });
        return;
      }
      return;
    }
    const staleFullPeek = peekMessengerBootstrapFull();
    const staleCritPeek = peekMessengerBootstrapCritical();
    const stale =
      staleFullPeek ??
      (staleCritPeek ? communityMessengerBootstrapFromCriticalPayload(staleCritPeek) : null);
    if (stale) {
      if (isDevSafeMode()) {
        return;
      }
      /**
       * 세션 복원 직후 재진입이 짧은 간격으로 반복될 때 stale hit마다 silent sync GET을 다시 열지 않게 한다.
       * 같은 탭에서 최근 silent sync를 이미 예약/실행했다면 이번 라운드는 캐시만 사용한다.
       */
      if (Date.now() - lastStaleCacheResumeSilentRefreshAt < STALE_CACHE_RESUME_SILENT_REFRESH_COOLDOWN_MS) {
        return;
      }
      let ricId: number | undefined;
      let resumeTimer: number | undefined;
      const runResume = () => {
        lastStaleCacheResumeSilentRefreshAt = Date.now();
        getMessengerBackgroundHydrationScheduler().schedule({
          id: `messenger:stale-resume-silent:${Date.now()}`,
          dedupeKey: "messenger:stale-resume-silent",
          priority: "medium",
          run: async () => {
            await refreshRef.current(true);
          },
        });
      };
      if (typeof requestIdleCallback === "function") {
        ricId = requestIdleCallback(runResume, { timeout: 1500 });
      } else {
        resumeTimer = window.setTimeout(runResume, 100);
      }
      return () => {
        if (ricId !== undefined && typeof cancelIdleCallback === "function") {
          cancelIdleCallback(ricId);
        }
        if (resumeTimer !== undefined) window.clearTimeout(resumeTimer);
      };
    }
    if (!tryClaimInitialForegroundBootstrap()) return;
    void refreshRef.current();
  }, [initialServerBootstrap, mergeDeferredMessengerCallLogs, shadowDispatch]);

  /** critical 이후 idle 에서 홈 Realtime·버스 attach — 셸·목록 먼저 */
  useEffect(() => {
    if (homeRealtimeGateOpen) return;
    const me = data?.me?.id?.trim();
    if (!me) return;
    let cancelled = false;
    const open = () => {
      if (cancelled) return;
      setHomeRealtimeGateOpen(true);
    };
    let ricHandle: number | undefined;
    let timeoutId: number | undefined;
    if (typeof requestIdleCallback === "function") {
      ricHandle = requestIdleCallback(open, { timeout: 1200 });
    } else {
      timeoutId = window.setTimeout(open, 0);
    }
    return () => {
      cancelled = true;
      if (ricHandle !== undefined && typeof cancelIdleCallback === "function") {
        cancelIdleCallback(ricHandle);
      }
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [homeRealtimeGateOpen, data?.me?.id]);

  /** `deferredCallLog` — 통화 탭 진입 등에서 1200ms follow-up 을 기다리지 않고 즉시 보강 */
  const hydrateDeferredCallLogs = useCallback(async () => {
    if (!dataRef.current?.deferredCallLog) return;
    await mergeDeferredMessengerCallLogs();
  }, [mergeDeferredMessengerCallLogs]);

  /** 친구 탭 — DB 단일 진실원 fallback (`call_logs` 패턴) */
  const mergeDeferredMessengerFriends = useCallback(async () => {
    const requestId = ++friendsHydrateRequestIdRef.current;
    friendsHydrateAbortRef.current?.abort();
    const controller = new AbortController();
    friendsHydrateAbortRef.current = controller;
    try {
      const res = await fetch("/api/community-messenger/friends", {
        cache: "no-store",
        credentials: "include",
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestId !== friendsHydrateRequestIdRef.current) return;
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        friends?: CommunityMessengerBootstrap["friends"];
      };
      if (!res.ok || !json.ok) return;
      setData((prev) => {
        if (!prev) return prev;
        const incomingFriends = json.friends ?? [];
        const next = applyHomeListPatch(
          prev,
          { kind: "home_sync", friends: incomingFriends, roomMode: "replace" },
          "bootstrap"
        );
        const resolved = resolveMessengerHomeBootstrapSetData("bootstrap", prev, next, {
          reason: "friends_tab_hydrate",
        });
        if (resolved && resolved !== prev) primeBootstrapCache(resolved);
        return resolved;
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      /* ignore */
    } finally {
      if (friendsHydrateAbortRef.current === controller) {
        friendsHydrateAbortRef.current = null;
      }
    }
  }, []);

  const hydrateMessengerFriends = useCallback(async () => {
    const cur = dataRef.current;
    if (!cur) return;
    const friendsEmpty = (cur.friends ?? []).length === 0;
    const criticalTier = cur.clientHydrationTier === "critical";
    if (!friendsEmpty && !criticalTier) return;
    await mergeDeferredMessengerFriends();
  }, [mergeDeferredMessengerFriends]);

  return {
    data,
    setData,
    loading,
    listAwaitingCritical,
    authRequired,
    setAuthRequired,
    pageError,
    setPageError,
    refresh,
    homeRealtimeGateOpen,
    hydrateDeferredCallLogs,
    hydrateMessengerFriends,
    shadowDispatch,
  };
}
