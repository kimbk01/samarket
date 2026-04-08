"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useRegion } from "@/contexts/RegionContext";
import {
  neighborhoodLocationKeyFromRegion,
  neighborhoodLocationLabelFromRegion,
  neighborhoodLocationMetaFromRegion,
} from "@/lib/neighborhood/location-key";
import { buildPhilifeNeighborhoodFeedClientUrl } from "@/lib/philife/neighborhood-feed-client-url";
import { warmPhilifeNeighborhoodFeedByUrl } from "@/lib/philife/warm-philife-neighborhood-feed";
import { isConstrainedNetwork, scheduleWhenBrowserIdle, cancelScheduledWhenBrowserIdle } from "@/lib/ui/network-policy";
import { usePhilifeFeedViewerSig } from "@/hooks/use-philife-feed-viewer-sig";

const PHILIFE_WARM_PREFETCH_TTL_MS = 3 * 60_000;
const warmedFeedAtByKey = new Map<string, number>();

/**
 * /philife 가 아닐 때만 워밍 — 피드 화면 자체의 요청과 중복 최소화
 */
export function PhilifeFeedWarmPrefetch() {
  const pathname = usePathname();
  const viewerSig = usePhilifeFeedViewerSig();
  const { currentRegion } = useRegion();
  const tickRef = useRef(0);

  useEffect(() => {
    if (!pathname) return;
    if (pathname === "/philife" || pathname.startsWith("/philife/")) return;
    if (document.visibilityState !== "visible") return;
    if (isConstrainedNetwork()) return;

    const locationKey = neighborhoodLocationKeyFromRegion(currentRegion);
    if (!locationKey) return;

    const meta = neighborhoodLocationMetaFromRegion(currentRegion);
    const locationLabel = neighborhoodLocationLabelFromRegion(currentRegion);
    const url = buildPhilifeNeighborhoodFeedClientUrl({
      locationKey,
      meta,
      locationLabelFallback: locationLabel,
      regionLabel: currentRegion?.label ?? null,
    });
    const cacheKey = `${locationKey}:${viewerSig}:${url}`;
    const lastWarmedAt = warmedFeedAtByKey.get(cacheKey) ?? 0;
    if (Date.now() - lastWarmedAt < PHILIFE_WARM_PREFETCH_TTL_MS) return;

    const my = ++tickRef.current;
    const t = window.setTimeout(() => {
      if (tickRef.current !== my) return;
      const idleId = scheduleWhenBrowserIdle(() => {
        if (document.visibilityState !== "visible") return;
        warmedFeedAtByKey.set(cacheKey, Date.now());
        warmPhilifeNeighborhoodFeedByUrl(url, {
          noStore: viewerSig !== "_anon",
        });
      }, 1800);
      refreshIdleId = idleId;
    }, 1800);
    let refreshIdleId = -1;

    return () => {
      tickRef.current += 1;
      window.clearTimeout(t);
      cancelScheduledWhenBrowserIdle(refreshIdleId);
    };
  }, [pathname, currentRegion, viewerSig]);

  return null;
}
