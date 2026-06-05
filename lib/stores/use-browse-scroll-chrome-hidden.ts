"use client";

import { useSyncExternalStore } from "react";
import {
  getBrowseScrollChromeHiddenServerSnapshot,
  getBrowseScrollChromeHiddenSnapshot,
  subscribeBrowseScrollChromeWithLifecycle,
} from "@/lib/stores/browse-scroll-chrome";

/** `/stores/browse/*` — 하단 탭 scroll-chrome hidden (4단은 browse-subtopic-collapse-chrome) */
export function useBrowseScrollChromeHidden(enabled: boolean): boolean {
  return useSyncExternalStore(
    (onStoreChange) => subscribeBrowseScrollChromeWithLifecycle(onStoreChange, enabled),
    () => (enabled ? getBrowseScrollChromeHiddenSnapshot() : false),
    getBrowseScrollChromeHiddenServerSnapshot
  );
}
