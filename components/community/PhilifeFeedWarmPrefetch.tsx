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
import { usePhilifeFeedViewerSig } from "@/hooks/use-philife-feed-viewer-sig";

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

    const my = ++tickRef.current;
    const t = window.setTimeout(() => {
      if (tickRef.current !== my) return;
      warmPhilifeNeighborhoodFeedByUrl(url, {
        noStore: viewerSig !== "_anon",
      });
    }, 600);

    return () => {
      tickRef.current += 1;
      window.clearTimeout(t);
    };
  }, [pathname, currentRegion, viewerSig]);

  return null;
}
