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
import { fetchCommunityMessengerHomeSilentLists } from "@/lib/community-messenger/cm-home-silent-lists-fetch";
import {
  messengerMonitorHomeListBootstrapUiAlign,
  messengerMonitorHomeSyncFetchMs,
  messengerMonitorSilentFailFallbackBootstrapMs,
} from "@/lib/community-messenger/monitoring/client";
import {
  clearBootstrapCache,
  peekBootstrapCache,
  peekMessengerBootstrapCritical,
  peekMessengerBootstrapFull,
  primeBootstrapCache,
  primeMessengerBootstrapCritical,
  primeMessengerBootstrapFull,
  primeMessengerBootstrapMinimal,
} from "@/lib/community-messenger/bootstrap-cache";
import { fetchCommunityMessengerBootstrapCriticalClient } from "@/lib/community-messenger/cm-bootstrap-client-fetch";
import {
  logCmBootstrapV2ClientFinalize,
  markCmBootstrapV2ClientFlowAnchor,
} from "@/lib/community-messenger/cm-bootstrap-v2-client-log";
import { communityMessengerBootstrapFromCriticalPayload } from "@/lib/community-messenger/home/critical-bootstrap-to-partial";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerBootstrapCritical,
  CommunityMessengerCallLog,
  CommunityMessengerFriendRequest,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import { mergeMessengerRoomSummaryForHomeSyncCriticalPatch } from "@/lib/community-messenger/merge-critical-home-sync-room-summary";
import { finishSilentRefreshRound, tryEnterSilentRefreshRound } from "@/lib/http/silent-refresh-coalesce";
import { cancelScheduledWhenBrowserIdle, scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";
import { fetchCommunityMessengerBootstrapClient } from "@/lib/community-messenger/cm-bootstrap-client-fetch";
import { getMessengerBackgroundHydrationScheduler } from "@/lib/community-messenger/background-hydration-scheduler";
import { mergeDiscoverableGroupsFromOpenGroupsClient } from "@/lib/community-messenger/merge-discoverable-open-groups-client";
import {
  recordMessengerBootstrapJsonParseComplete,
  recordMessengerHomeRefreshInvocation,
  samarketMessengerHomeDebugEvent,
} from "@/lib/runtime/samarket-runtime-debug";

/** critical 홈-sync 상단 블록 병합 — 서버 최근 순 · 로컬 나머지 유지 + 거래 `contextMeta` 역행 방지 */
function mergeCriticalRoomPatchesIntoLists(
  baseList: CommunityMessengerRoomSummary[],
  incoming: CommunityMessengerRoomSummary[]
): CommunityMessengerRoomSummary[] {
  if (!incoming.length) return baseList;
  const baseById = new Map(baseList.map((r) => [r.id, r]));
  const incomingIds = new Set(incoming.map((r) => r.id));
  const head = incoming.map((inc) => mergeMessengerRoomSummaryForHomeSyncCriticalPatch(baseById.get(inc.id), inc));
  const tail = baseList.filter((r) => !incomingIds.has(r.id));
  return [...head, ...tail];
}

/**
 * silent full 보강 등으로 서버 `requests` 가 통째로 올 때, 복제 지연으로 새 outgoing pending 이 빠지면
 * 검색 행이 쿨다운으로만 보이는 현상이 난다. 클라에만 남은 내 pending outgoing 은 유지한다.
 */
function mergeFriendRequestsKeepStaleOutgoing(
  base: CommunityMessengerBootstrap,
  serverList: CommunityMessengerFriendRequest[] | undefined
): CommunityMessengerFriendRequest[] {
  const server = serverList ?? [];
  const meId = base.me?.id?.trim();
  if (!meId) return server;
  const prev = base.requests ?? [];
  const extra = prev.filter((r) => {
    if (r.status !== "pending" || r.direction !== "outgoing" || r.requesterId !== meId) return false;
    return !server.some((s) => {
      if (String(s.id) === String(r.id)) return true;
      return (
        s.status === "pending" &&
        s.requesterId === r.requesterId &&
        s.addresseeId === r.addresseeId
      );
    });
  });
  if (!extra.length) return server;
  return [...server, ...extra];
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
let lastStaleCacheResumeSilentRefreshAt = 0;

export type UseCommunityMessengerHomeBootstrapArgs = {
  initialServerBootstrap: CommunityMessengerBootstrap | null | undefined;
  /** 언어 전환 시 effect 재실행 없이 최신 번역만 쓰기 위한 ref */
  tRef: MutableRefObject<(key: string) => string>;
};

export type UseCommunityMessengerHomeBootstrapResult = {
  data: CommunityMessengerBootstrap | null;
  setData: Dispatch<SetStateAction<CommunityMessengerBootstrap | null>>;
  loading: boolean;
  authRequired: boolean;
  setAuthRequired: Dispatch<SetStateAction<boolean>>;
  pageError: string | null;
  setPageError: Dispatch<SetStateAction<string | null>>;
  refresh: (silent?: boolean) => Promise<void>;
  homeRealtimeGateOpen: boolean;
};

/**
 * 메신저 홈 부트스트랩·사일런트 갱신·캐시 동기화·Realtime 게이트.
 * `CommunityMessengerHome` 본문(UI·액션)과 데이터 레이어 경계를 분리한다.
 */
export function useCommunityMessengerHomeBootstrap({
  initialServerBootstrap,
  tRef,
}: UseCommunityMessengerHomeBootstrapArgs): UseCommunityMessengerHomeBootstrapResult {
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
  const refreshAbortRef = useRef<AbortController | null>(null);
  const deferredCallLogRequestIdRef = useRef(0);
  const deferredCallLogAbortRef = useRef<AbortController | null>(null);
  /** silent critical 직후 full 보강 — 400ms 지연·라운드 시작 시 취소 */
  const silentFullSupplementTimerRef = useRef<number | null>(null);

  /**
   * 초기 state 는 서버와 동일해야 한다 — `peekBootstrapCache()` 는 클라 sessionStorage 만 읽어
   * SSR 시 null·CSR 첫 렌더에 데이터가 생기며 `MessengerHomeMainSections` 트리가 달라져 하이드레이션 오류가 난다.
   * 캐시 시드는 마운트 직후 `useLayoutEffect` 에서만 적용한다.
   */
  const [data, setData] = useState<CommunityMessengerBootstrap | null>(() => initialServerBootstrap ?? null);
  const [loading, setLoading] = useState(() => {
    if (initialServerBootstrap) return false;
    if (peekMessengerBootstrapFull() || peekMessengerBootstrapCritical()) return false;
    return true;
  });
  /** RSC+로그인 시에도 바로 열어 `participants` Realtime 이 목록·뱃지와 동시에 움직이게 한다(닫아 두면 520ms+ 밀림). */
  const [homeRealtimeGateOpen, setHomeRealtimeGateOpen] = useState(
    () => Boolean(initialServerBootstrap?.me?.id) || !Boolean(initialServerBootstrap)
  );
  const [authRequired, setAuthRequired] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (initialServerBootstrap) return;
    const fullCached = peekMessengerBootstrapFull();
    if (fullCached) {
      setData(fullCached);
      setLoading(false);
      if (fullCached.me?.id) setHomeRealtimeGateOpen(true);
      return;
    }
    const critCached = peekMessengerBootstrapCritical();
    if (!critCached) return;
    setData(communityMessengerBootstrapFromCriticalPayload(critCached));
    setLoading(false);
    if (critCached.me?.id) setHomeRealtimeGateOpen(true);
  }, [initialServerBootstrap]);

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
        const { deferredCallLog: _omit, ...rest } = prev;
        void _omit;
        const merged: CommunityMessengerBootstrap = {
          ...rest,
          calls: json.calls ?? rest.calls,
          tabs: { ...rest.tabs, calls: json.tabs?.calls ?? rest.tabs.calls },
        };
        primeBootstrapCache(merged);
        return merged;
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

  const mergeHomeSyncIntoBootstrap = useCallback(
    (
      payload: {
        chats?: CommunityMessengerBootstrap["chats"];
        groups?: CommunityMessengerBootstrap["groups"];
        requests?: CommunityMessengerBootstrap["requests"];
        friends?: CommunityMessengerBootstrap["friends"];
      },
      roomMode: "replace" | "critical_patch" = "replace"
    ) => {
      setData((prev) => {
        const tUiAlign0 = typeof performance !== "undefined" ? performance.now() : null;
        try {
          const base = prev ?? peekBootstrapCache();
          if (!base) return prev;
          const chats =
            roomMode === "critical_patch"
              ? mergeCriticalRoomPatchesIntoLists(base.chats, payload.chats ?? [])
              : payload.chats ?? base.chats;
          const groups =
            roomMode === "critical_patch"
              ? mergeCriticalRoomPatchesIntoLists(base.groups, payload.groups ?? [])
              : payload.groups ?? base.groups;
          const requests =
            roomMode === "critical_patch"
              ? base.requests
              : payload.requests !== undefined
                ? mergeFriendRequestsKeepStaleOutgoing(base, payload.requests)
                : payload.requests ?? base.requests;
          const friends =
            roomMode === "critical_patch" ? base.friends : payload.friends ?? base.friends;
          if (
            chats === base.chats &&
            groups === base.groups &&
            requests === base.requests &&
            friends === base.friends
          ) {
            return prev;
          }
          const next: CommunityMessengerBootstrap = {
            ...base,
            chats,
            groups,
            requests,
            friends,
            tabs: {
              ...base.tabs,
              chats: chats.length,
              groups: groups.length,
              friends: friends.length,
            },
          };
          primeBootstrapCache(next);
          return next;
        } finally {
          if (tUiAlign0 != null && typeof performance !== "undefined") {
            messengerMonitorHomeListBootstrapUiAlign(Math.round(performance.now() - tUiAlign0));
          }
        }
      });
    },
    []
  );

  const parseBootstrapJson = useCallback(
    async <T,>(res: Response): Promise<T> => {
      const json = (await res.json().catch(() => ({}))) as T;
      recordMessengerBootstrapJsonParseComplete();
      return json;
    },
    []
  );

  const refresh = useCallback(async (silent = false) => {
    recordMessengerHomeRefreshInvocation(silent);
    if (silent) {
      const now = Date.now();
      if (now < silentBackoffUntilRef.current) return;
      if (now - lastSilentRefreshAtRef.current < 380) {
        if (silentThrottleCoalesceTimerRef.current != null) clearTimeout(silentThrottleCoalesceTimerRef.current);
        silentThrottleCoalesceTimerRef.current = setTimeout(() => {
          silentThrottleCoalesceTimerRef.current = null;
          void refresh(true);
        }, Math.max(1, 380 - (Date.now() - lastSilentRefreshAtRef.current)));
        return;
      }
      if (silentThrottleCoalesceTimerRef.current != null) {
        clearTimeout(silentThrottleCoalesceTimerRef.current);
        silentThrottleCoalesceTimerRef.current = null;
      }
      lastSilentRefreshAtRef.current = now;
    }
    if (!tryEnterSilentRefreshRound(silent, silentRefreshBusyRef, silentRefreshAgainRef)) {
      return;
    }
    if (!silent && bootstrapNonSilentInFlightRef.current) {
      samarketMessengerHomeDebugEvent("messenger_home_refresh_skip_non_silent_inflight");
      return;
    }
    if (!silent) {
      bootstrapNonSilentInFlightRef.current = true;
    }
    const requestId = ++refreshRequestIdRef.current;
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
      setData(stale);
      setAuthRequired(false);
      setPageError(null);
    }
    if (shouldBlock) setLoading(true);
    try {
      if (silent) {
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
          mergeHomeSyncIntoBootstrap(
            {
              chats: json.chats ?? [],
              groups: json.groups ?? [],
            },
            "critical_patch"
          );
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
                  mergeHomeSyncIntoBootstrap({
                    chats: jsonFull.chats ?? [],
                    groups: jsonFull.groups ?? [],
                    requests: jsonFull.requests,
                    friends: jsonFull.friends,
                  });
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
              setAuthRequired(false);
              setPageError(null);
              setData((prev) => {
                if (!prev) {
                  primeBootstrapCache(next);
                  return next;
                }
                const merged: CommunityMessengerBootstrap = {
                  ...next,
                  requests: mergeFriendRequestsKeepStaleOutgoing(prev, next.requests ?? []),
                };
                primeBootstrapCache(merged);
                return merged;
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

        const scheduleDeferredLiteAndLog = (
          criticalRequestStartAt: number,
          criticalResponseAt: number,
          roomListVisibleAt: number,
          usedCachedSnapshot: boolean,
          usedCriticalPayload: boolean
        ) => {
          const sch = getMessengerBackgroundHydrationScheduler();
          const hydrateRequestId = requestId;

          const armFollowUp = (delayMs: number, enqueue: () => void) => {
            if (typeof window === "undefined") return;
            window.setTimeout(() => {
              if (hydrateRequestId !== refreshRequestIdRef.current) return;
              enqueue();
            }, delayMs);
          };

          sch.schedule({
            id: `messenger:deferred-lite-bootstrap:${hydrateRequestId}`,
            dedupeKey: "messenger:deferred-lite-bootstrap",
            priority: "medium",
            run: async (signal) => {
              const deferredStartAt = typeof performance !== "undefined" ? performance.now() : 0;
              let deferredFinishAt = deferredStartAt;
              try {
                samarketMessengerHomeDebugEvent("messenger_home_bootstrap_start", { mode: "lite" });
                const mergedSignal = abortSignalAny([controller.signal, signal]);
                const resLite = await fetchCommunityMessengerBootstrapClient("lite", {
                  signal: mergedSignal,
                });
                if (controller.signal.aborted || requestId !== refreshRequestIdRef.current) return;
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
                  primeMessengerBootstrapMinimal(next);
                  setAuthRequired(false);
                  setPageError(null);
                  setData((prev) => {
                    const merged: CommunityMessengerBootstrap = {
                      ...next,
                      requests: mergeFriendRequestsKeepStaleOutgoing(prev ?? next, next.requests ?? []),
                    };
                    primeMessengerBootstrapFull(merged);
                    return merged;
                  });
                  deferredFinishAt = typeof performance !== "undefined" ? performance.now() : 0;

                  armFollowUp(250, () => {
                    sch.schedule({
                      id: `messenger:followup:silent-refresh:${hydrateRequestId}`,
                      dedupeKey: "messenger:followup:silent-refresh",
                      priority: "low",
                      run: async () => {
                        await refresh(true);
                      },
                    });
                  });
                  if (next.deferredCallLog) {
                    armFollowUp(1200, () => {
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
                    sch.schedule({
                      id: `messenger:followup:discoverable:${hydrateRequestId}`,
                      dedupeKey: "messenger:followup:discoverable-open-groups",
                      priority: "low",
                      run: async () => {
                        await mergeDiscoverableGroupsFromOpenGroupsClient(setData, "replace");
                      },
                    });
                  });
                } else {
                  const unauthorized = resLite.status === 401 || resLite.status === 403;
                  if (unauthorized) {
                    clearBootstrapCache();
                    setAuthRequired(true);
                    setPageError(tRef.current("nav_messenger_login_required"));
                    setData(null);
                  } else {
                    setAuthRequired(false);
                    setPageError(tRef.current("nav_messenger_load_failed"));
                    if (!stale) setData(null);
                  }
                }
              } catch {
                /* ignore */
              } finally {
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
              }
            },
          });
        };

        if (staleFullOnly) {
          scheduleDeferredLiteAndLog(shellVisibleAt, shellVisibleAt, shellVisibleAt, true, false);
        } else if (staleCritPayload) {
          scheduleDeferredLiteAndLog(shellVisibleAt, shellVisibleAt, shellVisibleAt, true, true);
        } else {
          try {
            const criticalRequestStartAt = typeof performance !== "undefined" ? performance.now() : 0;
            const resCrit = await fetchCommunityMessengerBootstrapCriticalClient({ signal: controller.signal });
            const criticalResponseAt = typeof performance !== "undefined" ? performance.now() : 0;
            if (controller.signal.aborted || requestId !== refreshRequestIdRef.current) return;
            const jsonCrit = await parseBootstrapJson<
              CommunityMessengerBootstrapCritical & { ok?: boolean; error?: string }
            >(resCrit);
            if (resCrit.ok && jsonCrit.ok && jsonCrit.tier === "critical") {
              primeMessengerBootstrapCritical(jsonCrit);
              const partial = communityMessengerBootstrapFromCriticalPayload(jsonCrit);
              refreshDataOk = true;
              setAuthRequired(false);
              setPageError(null);
              setData(partial);
              if (partial.me?.id) setHomeRealtimeGateOpen(true);
              const runDefer = (roomListVisibleAt: number) => {
                scheduleDeferredLiteAndLog(
                  criticalRequestStartAt,
                  criticalResponseAt,
                  roomListVisibleAt,
                  false,
                  true
                );
              };
              if (typeof requestAnimationFrame === "function") {
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    runDefer(typeof performance !== "undefined" ? performance.now() : 0);
                  });
                });
              } else {
                runDefer(typeof performance !== "undefined" ? performance.now() : 0);
              }
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
            if (controller.signal.aborted || requestId !== refreshRequestIdRef.current) return;
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
              setAuthRequired(false);
              setPageError(null);
              setData((prev) => {
                if (!prev) {
                  primeMessengerBootstrapFull(next);
                  return next;
                }
                const merged: CommunityMessengerBootstrap = {
                  ...next,
                  requests: mergeFriendRequestsKeepStaleOutgoing(prev, next.requests ?? []),
                };
                primeMessengerBootstrapFull(merged);
                return merged;
              });
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
              } else {
                setAuthRequired(false);
                setPageError(tRef.current("nav_messenger_load_failed"));
                if (!silent && !stale) {
                  setData(null);
                }
              }
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      if (!silent) {
        setAuthRequired(false);
        setPageError(tRef.current("nav_messenger_load_failed"));
        if (!stale) {
          setData(null);
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
      loadedRef.current = true;
      if (shouldBlock) setLoading(false);
    }
    // tRef.current 만 읽음 — 언어 전환 시에도 동일 refresh 인스턴스 유지
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tRef 안정 참조
  }, [mergeDeferredMessengerCallLogs, mergeHomeSyncIntoBootstrap, parseBootstrapJson]);

  /** `refresh` 콜백 참조가 바뀌어도 초기 마운트 부트스트랩 effect 가 재실행·중복 fetch 되지 않게 */
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (initialServerBootstrap) {
      primeBootstrapCache(initialServerBootstrap);
      loadedRef.current = true;
      setAuthRequired(false);
      setPageError(null);
      if (initialServerBootstrap.deferredCallLog) {
        const timer = window.setTimeout(() => {
          getMessengerBackgroundHydrationScheduler().schedule({
            id: "messenger:ssr-deferred:calls-log",
            dedupeKey: "messenger:followup:calls-log",
            priority: "low",
            run: async () => {
              await mergeDeferredMessengerCallLogs();
            },
          });
        }, 160);
        return () => clearTimeout(timer);
      }
      return;
    }
    const staleFullPeek = peekMessengerBootstrapFull();
    const staleCritPeek = peekMessengerBootstrapCritical();
    const stale =
      staleFullPeek ??
      (staleCritPeek ? communityMessengerBootstrapFromCriticalPayload(staleCritPeek) : null);
    if (stale) {
      /**
       * 세션 복원 직후 재진입이 짧은 간격으로 반복될 때 stale hit마다 silent sync GET을 다시 열지 않게 한다.
       * 같은 탭에서 최근 silent sync를 이미 예약/실행했다면 이번 라운드는 캐시만 사용한다.
       */
      if (Date.now() - lastStaleCacheResumeSilentRefreshAt < STALE_CACHE_RESUME_SILENT_REFRESH_COOLDOWN_MS) {
        return;
      }
      const resumeTimer = window.setTimeout(() => {
        lastStaleCacheResumeSilentRefreshAt = Date.now();
        getMessengerBackgroundHydrationScheduler().schedule({
          id: `messenger:stale-resume-silent:${Date.now()}`,
          dedupeKey: "messenger:stale-resume-silent",
          priority: "medium",
          run: async () => {
            await refreshRef.current(true);
          },
        });
      }, 100);
      return () => clearTimeout(resumeTimer);
    }
    void refreshRef.current();
  }, [initialServerBootstrap, mergeDeferredMessengerCallLogs]);

  /** 과거 520ms 지연은 목록·홈 Realtime·알림 브리지와 하단 탭 배지가 서로 어긋나는 체감만 키움 — idle 한 틱으로만 연다. */
  useEffect(() => {
    if (homeRealtimeGateOpen) return;
    const idleId = scheduleWhenBrowserIdle(() => {
      setHomeRealtimeGateOpen(true);
    }, 0);
    return () => cancelScheduledWhenBrowserIdle(idleId);
  }, [homeRealtimeGateOpen]);

  return {
    data,
    setData,
    loading,
    authRequired,
    setAuthRequired,
    pageError,
    setPageError,
    refresh,
    homeRealtimeGateOpen,
  };
}
