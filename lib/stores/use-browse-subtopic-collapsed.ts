"use client";

import { useSyncExternalStore } from "react";
import {
  getBrowseSubtopicCollapsedServerSnapshot,
  getBrowseSubtopicCollapsedSnapshot,
  subscribeBrowseSubtopicCollapsed,
} from "@/lib/stores/browse-subtopic-collapse-chrome";

/** `/stores/browse/*` — 3단(1차 업종 탭) 접힘 (`browse-subtopic-collapse-chrome` 모듈 store) */
export function useBrowseSubtopicCollapsed(): boolean {
  return useSyncExternalStore(
    subscribeBrowseSubtopicCollapsed,
    getBrowseSubtopicCollapsedSnapshot,
    getBrowseSubtopicCollapsedServerSnapshot
  );
}
