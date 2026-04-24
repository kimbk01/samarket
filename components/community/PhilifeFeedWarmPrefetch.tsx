"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { buildPhilifeNeighborhoodFeedClientUrl } from "@/lib/philife/neighborhood-feed-client-url";
import { warmPhilifeNeighborhoodFeedByUrl } from "@/lib/philife/warm-philife-neighborhood-feed";
import { warmPhilifeNeighborhoodTopicOptions } from "@/lib/philife/fetch-neighborhood-topic-options-client";
import { isConstrainedNetwork, scheduleWhenBrowserIdle, cancelScheduledWhenBrowserIdle } from "@/lib/ui/network-policy";
import { usePhilifeFeedViewerSig } from "@/hooks/use-philife-feed-viewer-sig";
import {
  shouldRunBottomNavProgrammaticPrefetch,
  shouldRunPhilifeBackgroundFeedWarm,
} from "@/lib/runtime/next-js-dev-client";
import { mainBottomNavPrefetchTriggerKey } from "@/lib/main-menu/main-bottom-nav-prefetch-domain";

const PHILIFE_WARM_PREFETCH_TTL_MS = 3 * 60_000;
/** `warmPhilifeNeighborhoodFeedByUrl` 과 동일 간격 — RSC `/philife` 선로딩 과다 방지 */
const PHILIFE_ROUTE_PREFETCH_MIN_MS = 90_000;
/** 거래·마켓 셸에서 커뮤니티 탭이 자주 열림 — 워밍 스케줄을 더 앞당김 */
const PHILIFE_WARM_OUTER_DELAY_TRADE_MS = 320;
const PHILIFE_WARM_OUTER_DELAY_DEFAULT_MS = 520;
/** `scheduleWhenBrowserIdle` timeout — 과도한 대기 방지 */
const PHILIFE_WARM_IDLE_TIMEOUT_MS = 650;
const warmedFeedAtByKey = new Map<string, number>();
let lastPhilifeHrefPrefetchAt = 0;

/**
 * /philife 가 아닐 때만 워밍 — 피드 화면 자체의 요청과 중복 최소화
 */
export function PhilifeFeedWarmPrefetch() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useLayoutEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);
  const warmShellDomain = useMemo(() => mainBottomNavPrefetchTriggerKey(pathname || null), [pathname]);
  const viewerSig = usePhilifeFeedViewerSig();
  const tickRef = useRef(0);

  /**
   * deps: `viewerSig`·`warmShellDomain`·`router` — `/home`→`/market` 같이 **같은 거래 셸** 안에서는
   * `warmShellDomain` 불변이라 타이머를 리셋하지 않는다. 실행·가드에는 `pathnameRef` 로 최신 경로를 본다.
   */
  useEffect(() => {
    if (!shouldRunPhilifeBackgroundFeedWarm()) return;
    const path = pathnameRef.current;
    if (!path) return;
    if (path === "/philife" || path.startsWith("/philife/")) return;
    if (document.visibilityState !== "visible") return;
    if (isConstrainedNetwork()) return;

    const url = buildPhilifeNeighborhoodFeedClientUrl({ globalFeed: true });
    const cacheKey = `global:${viewerSig}:${url}`;
    const lastWarmedAt = warmedFeedAtByKey.get(cacheKey) ?? 0;
    if (Date.now() - lastWarmedAt < PHILIFE_WARM_PREFETCH_TTL_MS) return;

    const my = ++tickRef.current;
    let refreshIdleId = -1;
    const outerDelayMs = (() => {
      const p0 = pathnameRef.current;
      const d = mainBottomNavPrefetchTriggerKey(p0 || null);
      return d === "trade" ? PHILIFE_WARM_OUTER_DELAY_TRADE_MS : PHILIFE_WARM_OUTER_DELAY_DEFAULT_MS;
    })();
    const t = window.setTimeout(() => {
      if (tickRef.current !== my) return;
      const p = pathnameRef.current;
      if (!p || p === "/philife" || p.startsWith("/philife/")) return;
      refreshIdleId = scheduleWhenBrowserIdle(() => {
        if (document.visibilityState !== "visible") return;
        const p2 = pathnameRef.current;
        if (!p2 || p2 === "/philife" || p2.startsWith("/philife/")) return;
        const now = Date.now();
        warmedFeedAtByKey.set(cacheKey, now);
        warmPhilifeNeighborhoodFeedByUrl(url, {
          noStore: viewerSig !== "_anon",
        });
        warmPhilifeNeighborhoodTopicOptions();
        if (
          shouldRunBottomNavProgrammaticPrefetch() &&
          now - lastPhilifeHrefPrefetchAt >= PHILIFE_ROUTE_PREFETCH_MIN_MS
        ) {
          lastPhilifeHrefPrefetchAt = now;
          try {
            void router.prefetch("/philife");
          } catch {
            /* noop */
          }
        }
      }, PHILIFE_WARM_IDLE_TIMEOUT_MS);
    }, outerDelayMs);

    return () => {
      tickRef.current += 1;
      window.clearTimeout(t);
      cancelScheduledWhenBrowserIdle(refreshIdleId);
    };
  }, [viewerSig, warmShellDomain, router]);

  return null;
}
