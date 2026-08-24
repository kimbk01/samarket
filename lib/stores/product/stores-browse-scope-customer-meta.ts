/**
 * CATEGORY browse — resolve operator scope policy for customer meta + enable gate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listBrowseScopePolicyRows,
  mapBrowseScopeDbRow,
} from "@/lib/stores/product/stores-browse-scope-policy-db";
import { resolveBrowseScopePolicy } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
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
  discoveryShelf: import("@/lib/stores/stores-browse-discovery-shelf").StoresBrowseDiscoveryShelfConfig;
};

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

  const scheduleOk = isWithinProductScheduleWindow(resolved.scheduleStart, resolved.scheduleEnd);
  const enabled =
    resolved.enabled &&
    resolved.presentationMode !== "hidden" &&
    scheduleOk;

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
    discoveryShelf: resolved.discoveryShelf,
  };
}
