"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { buildPhilifeNeighborhoodFeedClientUrl } from "@/lib/philife/neighborhood-feed-client-url";
import { warmPhilifeNeighborhoodFeedByUrl } from "@/lib/philife/warm-philife-neighborhood-feed";
import { warmPhilifeNeighborhoodTopicOptions } from "@/lib/philife/fetch-neighborhood-topic-options-client";
import { isConstrainedNetwork, scheduleWhenBrowserIdle, cancelScheduledWhenBrowserIdle } from "@/lib/ui/network-policy";
import { usePhilifeFeedViewerSig } from "@/hooks/use-philife-feed-viewer-sig";
import { shouldRunPhilifeBackgroundFeedWarm } from "@/lib/runtime/next-js-dev-client";
import { mainBottomNavPrefetchTriggerKey } from "@/lib/main-menu/main-bottom-nav-prefetch-domain";
import { getSessionPhase, subscribeSessionPhase } from "@/lib/auth/dibay-session-manager";
import { hasSupabaseAuthTokenCookie } from "@/lib/home/home-banner-audience-hint";
const PHILIFE_WARM_PREFETCH_TTL_MS = 3 * 60_000;
/** 거래 셸 체류 중 탭 전환과 경합 줄이기 — 너무 짧으면 장시간 머문 뒤 메인 스레드·네트워크가 밀림 */
const PHILIFE_WARM_OUTER_DELAY_TRADE_MS = 900;
const PHILIFE_WARM_OUTER_DELAY_DEFAULT_MS = 520;
/** `scheduleWhenBrowserIdle` timeout — 과도한 대기 방지 */
const PHILIFE_WARM_IDLE_TIMEOUT_MS = 650;
/** 하단 탭 전환 직후에는 목적지 RSC·hydration·클라 fetch 를 먼저 끝낸다. */
const PHILIFE_WARM_BOTTOM_NAV_QUIET_MS = 2_500;
const warmedFeedAtByKey = new Map<string, number>();

function remainingBottomNavQuietMs(): number {
  if (typeof window === "undefined" || typeof performance === "undefined") return 0;
  const last = (window as unknown as { __samarketLastBottomNavRouteIntentAt?: number })
    .__samarketLastBottomNavRouteIntentAt;
  if (typeof last !== "number" || !Number.isFinite(last)) return 0;
  return Math.max(0, PHILIFE_WARM_BOTTOM_NAV_QUIET_MS - (performance.now() - last));
}

/**
 * /philife 가 아닐 때만 워밍 — 피드 화면 자체의 요청과 중복 최소화.
 * Community Home 기본 = globalFeed + recommended (지역 불필요).
 */
/**
 * 로그인 쿠키가 있는데 세션 확인이 아직 끝나지 않았는가 — 이때 비로그인 서명(`_anon`)으로 미리 받으면
 * 곧이어 사용자 서명으로 한 번 더 받게 되어 실행마다 동네 피드를 2번 받는다(운영 실측 실행당 2.00회).
 * 비로그인용 응답은 로그인 사용자에게 쓰이지 않으므로 기다렸다 사용자 기준 1번만 받는다.
 * 쿠키 없음(비회원) · 세션 확인이 끝난 경우는 지금처럼 바로 받는다.
 * (구조 수정안 1단계 C2-1 · docs/audit/supabase-request-surge-2026-11-18/fix-plan-for-approval.md)
 */
function useAnonWarmShouldWaitForSession(viewerSig: string): boolean {
  const phase = useSyncExternalStore(subscribeSessionPhase, getSessionPhase, () => "loading");
  if (viewerSig !== "_anon") return false;
  if (typeof document === "undefined") return false;
  if (!hasSupabaseAuthTokenCookie(document.cookie)) return false;
  /** 확인 중(loading·recovering)일 때만 기다린다. 확인이 끝났는데도 서명이 `_anon` 이면 예전처럼 바로 받는다(미리 받기가 영영 빠지지 않게). */
  return phase === "loading" || phase === "recovering";
}

export function PhilifeFeedWarmPrefetch() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useLayoutEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  const warmShellDomain = useMemo(() => mainBottomNavPrefetchTriggerKey(pathname || null), [pathname]);
  const viewerSig = usePhilifeFeedViewerSig();
  const waitForSession = useAnonWarmShouldWaitForSession(viewerSig);
  const tickRef = useRef(0);

  /**
   * deps: `viewerSig`·`warmShellDomain` — `/market` 내부 이동처럼 **같은 거래 셸** 안에서는
   * `warmShellDomain` 불변이라 타이머를 리셋하지 않는다. 실행·가드에는 `pathnameRef` 로 최신 경로를 본다.
   */
  useEffect(() => {
    if (!shouldRunPhilifeBackgroundFeedWarm()) return;
    if (waitForSession) return;
    const path = pathnameRef.current;
    if (!path) return;
    if (path === "/philife" || path.startsWith("/philife/")) return;
    if (document.visibilityState !== "visible") return;
    if (isConstrainedNetwork()) return;

    const url = buildPhilifeNeighborhoodFeedClientUrl({
      globalFeed: true,
      sort: "recommended",
    });
    const cacheKey = `global:${viewerSig}:${url}`;
    const lastWarmedAt = warmedFeedAtByKey.get(cacheKey) ?? 0;
    if (Date.now() - lastWarmedAt < PHILIFE_WARM_PREFETCH_TTL_MS) return;

    const my = ++tickRef.current;
    let refreshIdleId = -1;
    let warmTimer = -1;
    const baseOuterDelayMs = (() => {
      const p0 = pathnameRef.current;
      const d = mainBottomNavPrefetchTriggerKey(p0 || null);
      return d === "trade" ? PHILIFE_WARM_OUTER_DELAY_TRADE_MS : PHILIFE_WARM_OUTER_DELAY_DEFAULT_MS;
    })();

    const runWarm = () => {
      if (tickRef.current !== my) return;
      const p = pathnameRef.current;
      if (!p || p === "/philife" || p.startsWith("/philife/")) return;
      const quietRemaining = remainingBottomNavQuietMs();
      if (quietRemaining > 0) {
        warmTimer = window.setTimeout(runWarm, quietRemaining + 50);
        return;
      }
      refreshIdleId = scheduleWhenBrowserIdle(() => {
        if (document.visibilityState !== "visible") return;
        const p2 = pathnameRef.current;
        if (!p2 || p2 === "/philife" || p2.startsWith("/philife/")) return;
        if (remainingBottomNavQuietMs() > 0) return;
        const now = Date.now();
        warmedFeedAtByKey.set(cacheKey, now);
        warmPhilifeNeighborhoodFeedByUrl(url, {
          noStore: viewerSig !== "_anon",
        });
        warmPhilifeNeighborhoodTopicOptions();
      }, PHILIFE_WARM_IDLE_TIMEOUT_MS);
    };

    warmTimer = window.setTimeout(
      runWarm,
      Math.max(baseOuterDelayMs, remainingBottomNavQuietMs())
    );

    return () => {
      tickRef.current += 1;
      window.clearTimeout(warmTimer);
      cancelScheduledWhenBrowserIdle(refreshIdleId);
    };
  }, [viewerSig, warmShellDomain, waitForSession]);

  return null;
}
