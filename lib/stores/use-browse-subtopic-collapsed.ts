"use client";

import { useSyncExternalStore } from "react";
import {
  getBrowseSubtopicCollapsedServerSnapshot,
  getBrowseSubtopicCollapsedSnapshot,
  subscribeBrowseSubtopicCollapsed,
} from "@/lib/stores/browse-subtopic-collapse-chrome";

/** `/stores/browse/*` — 4단(2차 업종 칩) 접힘 (`browse-subtopic-collapse-chrome` 모듈 store) */
export function useBrowseSubtopicCollapsed(): boolean {
  return useSyncExternalStore(
    subscribeBrowseSubtopicCollapsed,
    getBrowseSubtopicCollapsedSnapshot,
    getBrowseSubtopicCollapsedServerSnapshot
  );
}
