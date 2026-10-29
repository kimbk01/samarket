/**
 * P-01 — 업종(1차·2차) 고객 노출 판정 단일 규칙 + 고객 화면 업종 탭·칩 필터.
 *
 * 판정: 상속 해석 결과(`resolveBrowseScopePolicy`)가 켜짐 + 표시 모드 ≠ hidden + 기간 안.
 * 목록 API(`resolveStoresBrowseScopeCustomerMeta`)와 업종 탭·칩이 같은 함수를 쓴다.
 * taxonomy 응답은 오너 폼도 쓰므로 원본은 그대로 두고 `browseHiddenScopeKeys` 만 추가 → 고객 파서가 거른다.
 */

import { isWithinProductScheduleWindow } from "@/lib/stores/product/stores-product-schedule-window";
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";

export function isBrowseScopeCustomerVisible(
  resolved: {
    enabled: boolean;
    presentationMode: string;
    scheduleStart: string | null;
    scheduleEnd: string | null;
  },
  nowMs: number = Date.now()
): boolean {
  return (
    resolved.enabled &&
    resolved.presentationMode !== "hidden" &&
    isWithinProductScheduleWindow(resolved.scheduleStart, resolved.scheduleEnd, nowMs)
  );
}

export type BrowseScopeDisplayTitles = Record<string, { ko: string | null; en: string | null }>;

/**
 * 고객 업종 탭·칩·헤더 — 숨긴 scope 제외(P-01) + 어드민 표시명 적용(P-02).
 * `primary` 또는 `primary/sub` scope key 기준.
 */
export function filterTaxonomyByBrowseHiddenScopeKeys<
  T extends { categories: StoreTaxonomyCategory[]; topics: StoreTaxonomyTopic[] },
>(
  taxonomy: T,
  hiddenScopeKeys: readonly string[] | null | undefined,
  displayTitles?: BrowseScopeDisplayTitles | null
): T {
  const titled = applyBrowseScopeDisplayTitles(taxonomy, displayTitles);
  if (!hiddenScopeKeys?.length) return titled;
  const hidden = new Set(hiddenScopeKeys.map((k) => k.trim().toLowerCase()));
  const slugByCategoryId = new Map<string, string>();
  for (const c of titled.categories) {
    slugByCategoryId.set(String(c.id), String(c.slug ?? "").trim().toLowerCase());
  }
  const categories = titled.categories.filter(
    (c) => !hidden.has(String(c.slug ?? "").trim().toLowerCase())
  );
  const topics = titled.topics.filter((t) => {
    const primary = slugByCategoryId.get(String(t.store_category_id)) ?? "";
    if (!primary || hidden.has(primary)) return false;
    return !hidden.has(`${primary}/${String(t.slug ?? "").trim().toLowerCase()}`);
  });
  return { ...titled, categories, topics };
}

function applyBrowseScopeDisplayTitles<
  T extends { categories: StoreTaxonomyCategory[]; topics: StoreTaxonomyTopic[] },
>(taxonomy: T, displayTitles: BrowseScopeDisplayTitles | null | undefined): T {
  if (!displayTitles || Object.keys(displayTitles).length === 0) return taxonomy;
  const slugByCategoryId = new Map<string, string>();
  const categories = taxonomy.categories.map((c) => {
    const pk = String(c.slug ?? "").trim().toLowerCase();
    slugByCategoryId.set(String(c.id), pk);
    const title = displayTitles[pk];
    if (!title) return c;
    return { ...c, name: title.ko ?? c.name, name_en: title.en ?? c.name_en };
  });
  const topics = taxonomy.topics.map((t) => {
    const pk = slugByCategoryId.get(String(t.store_category_id)) ?? "";
    const title = displayTitles[`${pk}/${String(t.slug ?? "").trim().toLowerCase()}`];
    if (!title) return t;
    return { ...t, name: title.ko ?? t.name, name_en: title.en ?? t.name_en };
  });
  return { ...taxonomy, categories, topics };
}

export function readBrowseScopeDisplayTitles(json: unknown): BrowseScopeDisplayTitles | null {
  const raw = (json as { browseScopeDisplayTitles?: unknown } | null)?.browseScopeDisplayTitles;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as BrowseScopeDisplayTitles) : null;
}

export function readBrowseHiddenScopeKeys(json: unknown): string[] {
  const raw = (json as { browseHiddenScopeKeys?: unknown } | null)?.browseHiddenScopeKeys;
  return Array.isArray(raw) ? raw.filter((k): k is string => typeof k === "string") : [];
}
