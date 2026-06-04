"use client";

import { useBrowseScrollChromeHidden } from "@/lib/stores/use-browse-scroll-chrome-hidden";

/**
 * `/stores/browse/*` — 목록 스크롤 시 4단(2차 업종 칩)만 접기. 1·2·3·5단 유지.
 * `browse-scroll-chrome` 단일 결정(overflow 게이트 · hold · 하단 탭과 동기).
 */
export function useStoresBrowseHeaderScrollHide(): boolean {
  return useBrowseScrollChromeHidden(true);
}
