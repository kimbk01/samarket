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
import { messengerMonitorHomeBootstrapUnreadSync } from "@/lib/community-messenger/monitoring/client";
import {
  clearBootstrapCache,
  peekBootstrapCache,
  primeBootstrapCache,
} from "@/lib/community-messenger/bootstrap-cache";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerCallLog,
  CommunityMessengerDiscoverableGroupSummary,
} from "@/lib/community-messenger/types";
import { finishSilentRefreshRound, tryEnterSilentRefreshRound } from "@/lib/http/silent-refresh-coalesce";
import { cancelScheduledWhenBrowserIdle, scheduleWhenBrowserIdle } from "@/lib/ui/network-policy";
import { fetchCommunityMessengerBootstrapClient } from "@/lib/community-messenger/cm-bootstrap-client-fetch";
import { fetchCommunityMessengerOpenGroupsClient } from "@/lib/community-messenger/cm-open-groups-client-fetch";

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
  /** `lastSilentRefreshAtRef` 380ms 창 안 요청은 버리지 않고 한 번만 지연 실행(방 부트스트랩과 동일 계약) */
  const silentThrottleCoalesceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 초기 state 는 서버와 동일해야 한다 — `peekBootstrapCache()` 는 클라 sessionStorage 만 읽어
   * SSR 시 null·CSR 첫 렌더에 데이터가 생기며 `MessengerHomeMainSections` 트리가 달라져 하이드레이션 오류가 난다.
   * 캐시 시드는 마운트 직후 `useLayoutEffect` 에서만 적용한다.
   */
  const [data, setData] = useState<CommunityMessengerBootstrap | null>(() => initialServerBootstrap ?? null);
  const [loading, setLoading] = useState(() => !Boolean(initialServerBootstrap));
  /** RSC+로그인 시에도 바로 열어 `participants` Realtime 이 목록·뱃지와 동시에 움직이게 한다(닫아 두면 520ms+ 밀림). */
  const [homeRealtimeGateOpen, setHomeRealtimeGateOpen] = useState(
    () => Boolean(initialServerBootstrap?.me?.id) || !Boolean(initialServerBootstrap)
  );
  const [authRequired, setAuthRequired] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (initialServerBootstrap) return;
    const cached = peekBootstrapCache();
    if (!cached) return;
    setData(cached);
    setLoading(false);
    if (cached.me?.id) setHomeRealtimeGateOpen(true);
  }, [initialServerBootstrap]);

  useEffect(() => {
    return () => {
      if (silentThrottleCoalesceTimerRef.current != null) {
        clearTimeout(silentThrottleCoalesceTimerRef.current);
        silentThrottleCoalesceTimerRef.current = null;
      }
    };
  }, []);

  /** 서버 `deferCallLog` 분기 — `listCommunityMessengerCallLogs` 단일 왕복 */
  const mergeDeferredMessengerCallLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/community-messenger/bootstrap?callsLog=1", {
        cache: "no-store",
        credentials: "include",
      });
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
    } catch {
      /* ignore */
    }
  }, []);

  const refresh = useCallback(async (silent = false) => {
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
    const stale = !silent ? peekBootstrapCache() : null;
    const shouldBlock = !silent && !loadedRef.current && !stale;
    const useLiteBootstrap = !silent && !stale && !loadedRef.current;
    if (stale) {
      setData(stale);
      setAuthRequired(false);
      setPageError(null);
    }
    if (shouldBlock) setLoading(true);
    try {
      if (silent) {
        const tSilentFetch = typeof performance !== "undefined" ? performance.now() : null;
        const { res, json } = await fetchCommunityMessengerHomeSilentLists();
        if (res.status === 429) {
          const ra = res.headers.get("Retry-After");
          const sec = Math.min(120, Math.max(1, Number.parseInt(ra ?? "", 10) || 5));
          silentBackoffUntilRef.current = Date.now() + sec * 1000;
        }
        if (res.ok && json.ok) {
          setData((prev) => {
            const base = prev ?? peekBootstrapCache();
            if (!base) return prev;
            const chats = json.chats ?? [];
            const groups = json.groups ?? [];
            const requests = json.requests ?? base.requests;
            const friends = json.friends ?? base.friends;
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
          });
          if (tSilentFetch != null) {
            messengerMonitorHomeBootstrapUnreadSync(Math.round(performance.now() - tSilentFetch));
          }
        } else {
          const unauthorized = res.status === 401 || res.status === 403;
          if (unauthorized) {
            clearBootstrapCache();
            setAuthRequired(true);
            setPageError(tRef.current("nav_messenger_login_required"));
            setData(null);
          } else {
            const resFull = await fetchCommunityMessengerBootstrapClient("fresh");
            const jsonFull = (await resFull.json().catch(() => ({}))) as CommunityMessengerBootstrap & {
              ok?: boolean;
              error?: string;
            };
            if (resFull.ok && jsonFull.ok) {
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
              setData(next);
              primeBootstrapCache(next);
              if (tSilentFetch != null) {
                messengerMonitorHomeBootstrapUnreadSync(Math.round(performance.now() - tSilentFetch));
              }
            }
          }
        }
      } else {
        const res = await fetchCommunityMessengerBootstrapClient(useLiteBootstrap ? "lite" : "full");
        const json = (await res.json().catch(() => ({}))) as CommunityMessengerBootstrap & {
          ok?: boolean;
          error?: string;
        };
        if (res.ok && json.ok) {
          const deferred = Boolean((json as { deferredCallLog?: unknown }).deferredCallLog);
          const next: CommunityMessengerBootstrap = {
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
          };
          setAuthRequired(false);
          setPageError(null);
          setData(next);
          primeBootstrapCache(next);
          if (useLiteBootstrap && deferred) {
            scheduleWhenBrowserIdle(() => {
              void mergeDeferredMessengerCallLogs();
            }, 160);
          }
          if (useLiteBootstrap) {
            scheduleWhenBrowserIdle(() => {
              void (async () => {
                try {
                  const res2 = await fetchCommunityMessengerOpenGroupsClient();
                  const j2 = (await res2.json().catch(() => ({}))) as {
                    ok?: boolean;
                    groups?: CommunityMessengerDiscoverableGroupSummary[];
                  };
                  if (!res2.ok || !j2.ok) return;
                  setData((prev) => {
                    if (!prev) return prev;
                    const merged = { ...prev, discoverableGroups: j2.groups ?? [] };
                    primeBootstrapCache(merged);
                    return merged;
                  });
                } catch {
                  /* ignore */
                }
              })();
            }, 0);
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
    } finally {
      finishSilentRefreshRound(silent, silentRefreshBusyRef, silentRefreshAgainRef, () => {
        void refresh(true);
      });
      loadedRef.current = true;
      if (shouldBlock) setLoading(false);
    }
    // tRef.current 만 읽음 — 언어 전환 시에도 동일 refresh 인스턴스 유지
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tRef 안정 참조
  }, [mergeDeferredMessengerCallLogs]);

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
        const idleId = scheduleWhenBrowserIdle(() => {
          void mergeDeferredMessengerCallLogs();
        }, 160);
        return () => cancelScheduledWhenBrowserIdle(idleId);
      }
      return;
    }
    const stale = peekBootstrapCache();
    if (stale) {
      const idleId = scheduleWhenBrowserIdle(() => {
        void refreshRef.current(true);
      }, 420);
      return () => {
        cancelScheduledWhenBrowserIdle(idleId);
      };
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
