"use client";

import { useSyncExternalStore } from "react";
import {
  getBrowseSubtopicScrollChromeHiddenServerSnapshot,
  getBrowseSubtopicScrollChromeHiddenSnapshot,
  subscribeBrowseSubtopicScrollChromeWithLifecycle,
} from "@/lib/stores/browse-subtopic-scroll-chrome";

/** browse 4단(2차 칩) — 하단 탭과 분리된 scroll-chrome */
export function useBrowseSubtopicScrollChromeHidden(enabled: boolean): boolean {
  return useSyncExternalStore(
    (onStoreChange) => subscribeBrowseSubtopicScrollChromeWithLifecycle(onStoreChange, enabled),
    () => (enabled ? getBrowseSubtopicScrollChromeHiddenSnapshot() : false),
    getBrowseSubtopicScrollChromeHiddenServerSnapshot
  );
}
