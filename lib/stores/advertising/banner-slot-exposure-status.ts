import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadResolvedCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-db";
import { homeBannerBeforeRestPolicyEnabled } from "@/lib/stores/composition/stores-composition-insertion-live";
import {
  listBrowseScopePolicyRows,
  mapBrowseScopeDbRow,
} from "@/lib/stores/product/stores-browse-scope-policy-db";
import { resolveBrowseScopePolicy } from "@/lib/stores/product/stores-browse-scope-policy-catalog";

/**
 * H-05 — 배너 슬롯이 고객에게 실제로 열려 있는지.
 * 새 규칙 없음: 고객 배너 API 가 쓰는 런타임 게이트 함수를 그대로 호출한다.
 * - STORES_HOME_HERO: 슬롯 스위치 없음 (`/api/stores/home-hero-banners`)
 * - STORES_HOME_INLINE_1: `homeBannerBeforeRestPolicyEnabled` (`/api/stores/home-before-rest-banners`)
 * - STORES_CATEGORY_TOP: 업종별 `resolveBrowseScopePolicy().bannerAds` (`/api/stores/browse-top-banners`)
 */
export type BannerSlotExposureStatus = {
  inventoryKey: "STORES_HOME_HERO" | "STORES_HOME_INLINE_1" | "STORES_CATEGORY_TOP";
  /** 고객에게 한 곳이라도 열려 있음 */
  open: boolean;
  /** 업종 상단만 — 배너가 열린 1차 업종 slug */
  openPrimarySlugs: string[] | null;
};

export async function loadBannerSlotExposureStatuses(
  sb: SupabaseClient
): Promise<Record<BannerSlotExposureStatus["inventoryKey"], BannerSlotExposureStatus>> {
  const [home, scopeRows] = await Promise.all([
    loadResolvedCompositionPolicy(sb, "home"),
    listBrowseScopePolicyRows(sb),
  ]);
  const mapped = scopeRows.map(mapBrowseScopeDbRow);
  const primaryRowBySlug = new Map(mapped.filter((r) => !r.subSlug).map((r) => [r.primarySlug, r]));
  /** 1차 행 + 2차 행(1차 상속·재정의) 각각을 고객 API 와 같은 해석기로 판정 */
  const openPrimarySlugs = [
    ...new Set(
      mapped
        .filter(
          (r) =>
            resolveBrowseScopePolicy({
              primarySlug: r.primarySlug,
              subSlug: r.subSlug ?? null,
              primaryRow: primaryRowBySlug.get(r.primarySlug) ?? null,
              subRow: r.subSlug ? r : null,
            }).bannerAds.enabled
        )
        .map((r) => r.primarySlug)
    ),
  ];
  const inlineOpen = homeBannerBeforeRestPolicyEnabled(home.rows);
  return {
    STORES_HOME_HERO: { inventoryKey: "STORES_HOME_HERO", open: true, openPrimarySlugs: null },
    STORES_HOME_INLINE_1: { inventoryKey: "STORES_HOME_INLINE_1", open: inlineOpen, openPrimarySlugs: null },
    STORES_CATEGORY_TOP: {
      inventoryKey: "STORES_CATEGORY_TOP",
      open: openPrimarySlugs.length > 0,
      openPrimarySlugs,
    },
  };
}
