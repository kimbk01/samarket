"use client";

import { useLayoutEffect } from "react";
import { StoresHomePrimaryCategoryPanel } from "@/components/stores/home/hub/StoresHomeCategoryStickyBelow";
import { StoresHomeSubCategoryPanel } from "@/components/stores/home/hub/StoresHomeSubCategoryPanel";
import { STORES_HOME_CATEGORY_SSR_SEED_ID } from "@/lib/stores/stores-home-category-seed-panel-model";

/**
 * hydration 후 동일 위치에서 interactive 패널로 교체 — SSR seed DOM 제거.
 */
export function StoresHomeCategorySeedPanelClient() {
  useLayoutEffect(() => {
    document.getElementById(STORES_HOME_CATEGORY_SSR_SEED_ID)?.remove();
  }, []);

  return (
    <>
      <StoresHomeSubCategoryPanel />
      <StoresHomePrimaryCategoryPanel />
    </>
  );
}
