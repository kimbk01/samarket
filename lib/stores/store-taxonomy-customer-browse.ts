/**
 * 업종 노출 정책(`/admin/stores-category-policy`) → 고객 업종 탭·타일·2차 칩.
 *
 * `/api/stores/taxonomy` 는 사장님 매장 등록 폼도 쓰므로 업종 행을 빼지 않고 `customerBrowse` 를 덧붙인다.
 * 고객 화면만 이 메타로 ① 숨김 업종(OFF·기간 밖)을 탭·칩에서 빼고 ② 1차 표시명을 업종 이름으로 쓴다.
 * 판정은 목록·배너와 같은 `isBrowseScopeCustomerVisible`.
 */
import type { StoreTaxonomyCategory, StoreTaxonomyTopic } from "@/lib/stores/store-taxonomy-types";

export type StoresTaxonomyCustomerBrowseMeta = {
  /** 고객에게 숨길 scopeKey (`restaurant`, `restaurant/chinese`) */
  hiddenScopeKeys: string[];
  /** 1차 업종 표시명 (운영자가 입력한 값만) */
  primaryDisplayTitles: Record<string, { ko: string | null; en: string | null }>;
};

type ResolvedScopeLike = {
  visible: boolean;
  displayTitleKo: string | null;
  displayTitleEn: string | null;
};

export function buildStoresTaxonomyCustomerBrowseMeta(input: {
  categories: readonly StoreTaxonomyCategory[];
  topics: readonly StoreTaxonomyTopic[];
  resolvePrimary: (primarySlug: string) => ResolvedScopeLike;
  resolveSub: (primarySlug: string, subSlug: string) => ResolvedScopeLike;
}): StoresTaxonomyCustomerBrowseMeta {
  const hiddenScopeKeys: string[] = [];
  const primaryDisplayTitles: StoresTaxonomyCustomerBrowseMeta["primaryDisplayTitles"] = {};
  const slugByCategoryId = new Map<string, string>();
  for (const c of input.categories) {
    const slug = String(c.slug ?? "").trim().toLowerCase();
    if (!slug) continue;
    slugByCategoryId.set(String(c.id ?? "").trim(), slug);
    const resolved = input.resolvePrimary(slug);
    if (!resolved.visible) hiddenScopeKeys.push(slug);
    const ko = resolved.displayTitleKo?.trim() || null;
    const en = resolved.displayTitleEn?.trim() || null;
    if (ko || en) primaryDisplayTitles[slug] = { ko, en };
  }
  for (const t of input.topics) {
    const primary = slugByCategoryId.get(String(t.store_category_id ?? "").trim());
    const sub = String(t.slug ?? "").trim().toLowerCase();
    if (!primary || !sub) continue;
    if (!input.resolveSub(primary, sub).visible) hiddenScopeKeys.push(`${primary}/${sub}`);
  }
  return { hiddenScopeKeys, primaryDisplayTitles };
}

function parseMeta(raw: unknown): StoresTaxonomyCustomerBrowseMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const hidden = Array.isArray(o.hiddenScopeKeys)
    ? o.hiddenScopeKeys.map((k) => String(k).trim().toLowerCase()).filter(Boolean)
    : [];
  const titles: StoresTaxonomyCustomerBrowseMeta["primaryDisplayTitles"] = {};
  if (o.primaryDisplayTitles && typeof o.primaryDisplayTitles === "object") {
    for (const [slug, v] of Object.entries(o.primaryDisplayTitles as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const t = v as { ko?: unknown; en?: unknown };
      titles[slug.trim().toLowerCase()] = {
        ko: typeof t.ko === "string" && t.ko.trim() ? t.ko.trim() : null,
        en: typeof t.en === "string" && t.en.trim() ? t.en.trim() : null,
      };
    }
  }
  return { hiddenScopeKeys: hidden, primaryDisplayTitles: titles };
}

/** 고객 파서 공용 — 1차 이름을 표시명으로, 숨김 업종에 `customer_browse_hidden` 표시 (행은 유지) */
export function applyCustomerBrowseTaxonomyMeta(
  categories: StoreTaxonomyCategory[],
  topics: StoreTaxonomyTopic[],
  rawMeta: unknown
): { categories: StoreTaxonomyCategory[]; topics: StoreTaxonomyTopic[] } {
  const meta = parseMeta(rawMeta);
  if (!meta) return { categories, topics };
  const hidden = new Set(meta.hiddenScopeKeys);
  const slugByCategoryId = new Map<string, string>();
  const nextCategories = categories.map((c) => {
    const slug = String(c.slug ?? "").trim().toLowerCase();
    slugByCategoryId.set(String(c.id ?? "").trim(), slug);
    const title = meta.primaryDisplayTitles[slug];
    return {
      ...c,
      name: title?.ko ?? c.name,
      name_en: title?.en ?? c.name_en,
      customer_browse_hidden: hidden.has(slug),
    };
  });
  const nextTopics = topics.map((t) => {
    const primary = slugByCategoryId.get(String(t.store_category_id ?? "").trim()) ?? "";
    const sub = String(t.slug ?? "").trim().toLowerCase();
    return { ...t, customer_browse_hidden: hidden.has(primary) || hidden.has(`${primary}/${sub}`) };
  });
  return { categories: nextCategories, topics: nextTopics };
}
