"use client";

import { useBrowseSubtopicScrollChromeHidden } from "@/lib/stores/use-browse-subtopic-scroll-chrome-hidden";

/**
 * `/stores/browse/*` — 목록 스크롤 시 4단(2차 업종 칩)만 접기. 1·2·3·5단 유지.
 * `browse-subtopic-scroll-chrome` 전용(overflow 게이트 없음 · 하단 탭과 분리).
 */
export function useStoresBrowseHeaderScrollHide(): boolean {
  return useBrowseSubtopicScrollChromeHidden(true);
}
