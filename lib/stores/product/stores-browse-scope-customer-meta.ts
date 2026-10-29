/**
 * CATEGORY browse — resolve operator scope policy for customer meta + enable gate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listBrowseScopePolicyRows,
  mapBrowseScopeDbRow,
} from "@/lib/stores/product/stores-browse-scope-policy-db";
import {
  resolveBrowseScopePolicy,
  type StoresBrowseScopePolicyResolved,
} from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import { isWithinProductScheduleWindow } from "@/lib/stores/product/stores-product-schedule-window";

export type StoresBrowseScopeCustomerMeta = {
  primarySlug: string;
  subSlug: string | null;
  /** false → customer list must be empty for this scope */
  enabled: boolean;
  displayTitleKo: string | null;
  displayTitleEn: string | null;
  adEnabled: boolean;
  couponEnabled: boolean;
  maxInsertion: number | null;
  intervalEveryN: number;
  presentationMode: string;
  cardType: "store" | "product" | "mixed";
  defaultSort: import("@/lib/stores/store-discovery-browse-sort").StoreBrowseServerSortId;
  popularityWindowDays: import("@/lib/stores/store-discovery-popular-store").StoresPopularityWindowDays;
  rankingCriteria: import("@/lib/stores/stores-browse-ranking-criteria").StoresBrowseAdminRankingCriterionId[];
  customerSortAvailability: import("@/lib/stores/stores-browse-customer-sort-availability").StoresBrowseCustomerSortAvailability;
  discoveryShelf: import("@/lib/stores/stores-browse-discovery-shelf").StoresBrowseDiscoveryShelfConfig;
};

/**
 * 고객 노출 판정 단일 정의 — 목록·업종 상단 배너·업종 탭/칩이 모두 이 결과를 따른다.
 * OFF·숨김 표현·노출 기간 밖이면 고객에게 이 업종(1·2차)이 보이지 않는다.
 */
export function isBrowseScopeCustomerVisible(
  resolved: Pick<StoresBrowseScopePolicyResolved, "enabled" | "presentationMode" | "scheduleStart" | "scheduleEnd">,
  nowMs: number = Date.now()
): boolean {
  return (
    resolved.enabled &&
    resolved.presentationMode !== "hidden" &&
    isWithinProductScheduleWindow(resolved.scheduleStart, resolved.scheduleEnd, nowMs)
  );
}

export async function resolveStoresBrowseScopeCustomerMeta(
  sb: SupabaseClient,
  primarySlug: string,
  subSlug: string | null
): Promise<StoresBrowseScopeCustomerMeta> {
  const pk = primarySlug.trim().toLowerCase();
  const skRaw = subSlug?.trim().toLowerCase() ?? null;
  const sk = skRaw && skRaw !== "all" ? skRaw : null;

  const dbRows = await listBrowseScopePolicyRows(sb);
  const mapped = dbRows.map(mapBrowseScopeDbRow);
  const byScope = new Map(mapped.map((r) => [r.scopeKey, r]));
  const primaryRow = byScope.get(pk) ?? null;
  const subRow = sk ? byScope.get(`${pk}/${sk}`) ?? null : null;
  const resolved = resolveBrowseScopePolicy({
    primarySlug: pk,
    subSlug: sk,
    primaryRow,
    subRow,
  });

  /** CATEGORY card anatomy is fixed — StoreBrowseCategoryRowCard only. */
  const cardType = "store" as const;

  const enabled = isBrowseScopeCustomerVisible(resolved);

  return {
    primarySlug: pk,
    subSlug: sk,
    enabled,
    displayTitleKo: resolved.displayTitleKo,
    displayTitleEn: resolved.displayTitleEn,
    adEnabled: resolved.adEnabled,
    couponEnabled: resolved.couponEnabled,
    maxInsertion: resolved.maxInsertion,
    intervalEveryN: resolved.intervalEveryN,
    presentationMode: resolved.presentationMode,
    cardType,
    defaultSort: resolved.defaultSort,
    popularityWindowDays: resolved.popularityWindowDays,
    rankingCriteria: resolved.rankingCriteria,
    customerSortAvailability: resolved.customerSortAvailability,
    discoveryShelf: resolved.discoveryShelf,
  };
}
