"use client";

import { StoresHomePrimaryCategoryPanel } from "@/components/stores/home/hub/StoresHomeCategoryStickyBelow";
import { StoresHomeSubCategoryPanel } from "@/components/stores/home/hub/StoresHomeSubCategoryPanel";

/** CONTRACT — `/stores` 고정 헤더 스택: 1차 업종 → 2차 업종 (스크롤 본문 밖). */
export function StoresHomeCategoryHeaderStack() {
  return (
    <div className="delivery-ui w-full shrink-0">
      <StoresHomePrimaryCategoryPanel />
      <StoresHomeSubCategoryPanel />
    </div>
  );
}
