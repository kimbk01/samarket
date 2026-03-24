"use client";

import { useSyncExternalStore } from "react";
import {
  getBrowseIndustryListenerVersion,
  subscribeBrowseIndustryListeners,
} from "./browse-industry-merge";

/** 어드민에서 업종 저장 시 매장 둘러보기·신청 폼이 다시 그리도록 구독 */
export function useBrowseIndustryDatasetVersion(): number {
  return useSyncExternalStore(
    subscribeBrowseIndustryListeners,
    getBrowseIndustryListenerVersion,
    () => 0
  );
}
