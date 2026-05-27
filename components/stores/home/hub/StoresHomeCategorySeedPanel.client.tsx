"use client";

import { StoresHomePrimaryCategoryPanel } from "@/components/stores/home/hub/StoresHomeCategoryStickyBelow";
import { StoresHomeSubCategoryPanel } from "@/components/stores/home/hub/StoresHomeSubCategoryPanel";

/** CONTRACT — `/stores` 카테고리 UI 단일 소스. SSR seed·rail 교체 패턴 금지. */
export function StoresHomeCategorySeedPanelClient() {
  return (
    <>
      <StoresHomeSubCategoryPanel />
      <StoresHomePrimaryCategoryPanel />
    </>
  );
}
