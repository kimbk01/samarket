/**
 * CATEGORY browse — resolve operator scope policy for customer meta + enable gate.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listBrowseScopePolicyRows,
  mapBrowseScopeDbRow,
} from "@/lib/stores/product/stores-browse-scope-policy-db";
import { resolveBrowseScopePolicy } from "@/lib/stores/product/stores-browse-scope-policy-catalog";
import { isBrowseScopeCustomerVisible } from "@/lib/stores/product/stores-browse-scope-visibility";
import { browseShelfAppliesToPage } from "@/lib/stores/stores-browse-discovery-shelf";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";

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
 * P-01 — 정책 조회 실패 시 직전 성공 값 사용 (실패 = 차단 해제로 꺼진 업종이 열리지 않게).
 * 인스턴스 메모리 — 한 번도 성공 못 한 인스턴스는 예외를 그대로 던진다(기존 호출부 처리).
 */
let lastGoodBrowseScopePolicyRows: Awaited<ReturnType<typeof listBrowseScopePolicyRows>> | null = null;

async function listBrowseScopePolicyRowsWithLastGood(sb: SupabaseClient) {
  try {
    const rows = await listBrowseScopePolicyRows(sb);
    lastGoodBrowseScopePolicyRows = rows;
    return rows;
  } catch (e) {
    if (lastGoodBrowseScopePolicyRows) return lastGoodBrowseScopePolicyRows;
    throw e;
  }
}

export async function resolveStoresBrowseScopeCustomerMeta(
  sb: SupabaseClient,
  primarySlug: string,
  subSlug: string | null
): Promise<StoresBrowseScopeCustomerMeta> {
  const pk = primarySlug.trim().toLowerCase();
  const skRaw = subSlug?.trim().toLowerCase() ?? null;
  const sk = skRaw && skRaw !== "all" ? skRaw : null;

  const dbRows = await listBrowseScopePolicyRowsWithLastGood(sb);
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
    discoveryShelf: resolveDiscoveryShelfForPage(pk, resolved.discoveryShelf, mapped),
  };
}

/**
 * P-07 — 탐색 선반 「노출 1차 목록」은 설정한 업종이 아니라 **노출 대상 업종 페이지**에 적용.
 * 우선순위: 이 페이지 자기 설정이 자기를 노출 대상으로 지정 > 다른 1차 설정 중 이 페이지를 지정한 것(scope key 순).
 */
function resolveDiscoveryShelfForPage(
  pagePrimarySlug: string,
  own: StoresBrowseScopeCustomerMeta["discoveryShelf"],
  rows: readonly ReturnType<typeof mapBrowseScopeDbRow>[]
): StoresBrowseScopeCustomerMeta["discoveryShelf"] {
  if (browseShelfAppliesToPage(own, pagePrimarySlug)) return own;
  const others = rows
    .filter((r) => !r.scopeKey.includes("/") && r.scopeKey !== pagePrimarySlug)
    .sort((a, b) => a.scopeKey.localeCompare(b.scopeKey));
  for (const row of others) {
    const cfg = resolveBrowseScopePolicy({
      primarySlug: row.scopeKey,
      subSlug: null,
      primaryRow: row,
      subRow: null,
    }).discoveryShelf;
    if (browseShelfAppliesToPage(cfg, pagePrimarySlug)) return cfg;
  }
  return own;
}

export type BrowseScopeCustomerTaxonomyPolicy = {
  /** P-01 — 고객에게 숨길 scope key (`primary`, `primary/sub`). 1차 OFF 면 그 2차는 1차 key 로 함께 숨는다. */
  hiddenScopeKeys: string[];
  /**
   * P-02 — 어드민 표시명 (scope key → ko/en). 1차는 해석된 표시명, 2차는 2차 행에 1차와 다른 표시명을 둔 경우만
   * (2차 표시명은 상속 시 1차 표시명과 같아 칩 이름을 덮지 않는다).
   */
  displayTitles: Record<string, { ko: string | null; en: string | null }>;
};

/** 업종 노출 정책을 고객 업종 탭·칩·헤더에 실어 목록 API 와 같은 판정을 쓰게 한다 (taxonomy 응답 부가 필드). */
export async function loadBrowseScopeCustomerTaxonomyPolicy(
  sb: SupabaseClient,
  categories: readonly StoreTaxonomyCategory[],
  topics: readonly StoreTaxonomyTopic[]
): Promise<BrowseScopeCustomerTaxonomyPolicy> {
  const dbRows = await listBrowseScopePolicyRowsWithLastGood(sb);
  const out: BrowseScopeCustomerTaxonomyPolicy = { hiddenScopeKeys: [], displayTitles: {} };
  if (dbRows.length === 0) return out;
  const byScope = new Map(dbRows.map(mapBrowseScopeDbRow).map((r) => [r.scopeKey, r]));
  const slugById = new Map<string, string>();
  const primaryTitle = new Map<string, { ko: string | null; en: string | null }>();
  for (const c of categories) {
    const pk = String(c.slug ?? "").trim().toLowerCase();
    if (!pk) continue;
    slugById.set(String(c.id), pk);
    const resolved = resolveBrowseScopePolicy({
      primarySlug: pk,
      subSlug: null,
      primaryRow: byScope.get(pk) ?? null,
      subRow: null,
    });
    if (!isBrowseScopeCustomerVisible(resolved)) out.hiddenScopeKeys.push(pk);
    const title = { ko: resolved.displayTitleKo?.trim() || null, en: resolved.displayTitleEn?.trim() || null };
    primaryTitle.set(pk, title);
    if (title.ko || title.en) out.displayTitles[pk] = title;
  }
  for (const t of topics) {
    const pk = slugById.get(String(t.store_category_id));
    const sk = String(t.slug ?? "").trim().toLowerCase();
    if (!pk || !sk || out.hiddenScopeKeys.includes(pk)) continue;
    const subRow = byScope.get(`${pk}/${sk}`) ?? null;
    const resolved = resolveBrowseScopePolicy({
      primarySlug: pk,
      subSlug: sk,
      primaryRow: byScope.get(pk) ?? null,
      subRow,
    });
    if (!isBrowseScopeCustomerVisible(resolved)) out.hiddenScopeKeys.push(`${pk}/${sk}`);
    const parent = primaryTitle.get(pk);
    const ko = subRow?.displayTitleKo?.trim() || null;
    const en = subRow?.displayTitleEn?.trim() || null;
    const ownKo = ko && ko !== parent?.ko ? ko : null;
    const ownEn = en && en !== parent?.en ? en : null;
    if (ownKo || ownEn) out.displayTitles[`${pk}/${sk}`] = { ko: ownKo, en: ownEn };
  }
  return out;
}
