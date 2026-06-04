"use client";

import { useSyncExternalStore } from "react";
import {
  getBrowseScrollChromeHiddenServerSnapshot,
  getBrowseScrollChromeHiddenSnapshot,
  subscribeBrowseScrollChromeWithLifecycle,
} from "@/lib/stores/browse-scroll-chrome";

/** `/stores/browse/*` — 2차 칩·하단 탭 공통 scroll-chrome hidden */
export function useBrowseScrollChromeHidden(enabled: boolean): boolean {
  return useSyncExternalStore(
    (onStoreChange) => subscribeBrowseScrollChromeWithLifecycle(onStoreChange, enabled),
    () => (enabled ? getBrowseScrollChromeHiddenSnapshot() : false),
    getBrowseScrollChromeHiddenServerSnapshot
  );
}
