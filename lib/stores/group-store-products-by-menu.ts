/** API 응답의 store_products 행(임베드 포함) → 카드용 + 그룹핑 */

import type { AppLanguageCode } from "@/lib/i18n/config";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { parseProductOptionsJson } from "@/lib/stores/product-line-options";

export function itemTypeShortLabel(item_type: unknown, lang: AppLanguageCode): string | null {
  const t = typeof item_type === "string" ? item_type : null;
  if (t === "menu") {
    return safeTranslate(lang, "store_item_type_menu", { fallbackKo: "메뉴", fallbackEn: "Menu" });
  }
  if (t === "service") {
    return safeTranslate(lang, "store_item_type_service", {
      fallbackKo: "서비스",
      fallbackEn: "Service",
    });
  }
  if (t === "product") {
    return safeTranslate(lang, "store_item_type_product", {
      fallbackKo: "상품",
      fallbackEn: "Product",
    });
  }
  return null;
}

export type StoreDetailProductCard = {
  id: string;
  title: string;
  summary: string | null;
  price: number;
  discount_price: number | null;
  discount_percent: number | null;
  /** false·미정: 재고 무시(품절 배지 없음) */
  track_inventory: boolean;
  stock_qty: number;
  thumbnail_url: string | null;
  pickup_available: boolean | null;
  local_delivery_available: boolean | null;
  shipping_available: boolean | null;
  /** 레거시·목록 배지 호환 — 신규는 is_owner_recommended / is_representative */
  is_featured: boolean;
  /** 사장님 추천(상단 섹션 + 카테고리 동시 노출) */
  is_owner_recommended: boolean;
  /** 대표 메뉴(상단 가로 등 + 카테고리 동시 노출) */
  is_representative: boolean;
  item_type: string | null;
  categoryName: string | null;
  /** store_menu_sections.id — 메뉴 그룹 키 */
  menu_section_id: string | null;
  /** 매장 전용 메뉴 구역 정렬용 (낮을수록 먼저) */
  menuSectionSort: number;
  /** 같은 메뉴 구역 내 정렬 */
  sort_order: number;
  /** 옵션 그룹이 1개 이상이면 true (목록에서 뱃지용) */
  has_options: boolean;
  /** 퀵 담기·시트와 동일한 수량 하한·상한 */
  min_order_qty: number;
  max_order_qty: number;
  /** `sold_out` 등 — 구매자 목록 노출 시 담기 비활성 */
  product_status: string;
  /** 인기 메뉴 섹션 전용(1-based). 목록 카드에는 보통 비움 */
  popular_rank?: number | null;
};

type CatEmbed = { name?: string } | { name?: string }[] | null | undefined;
type MenuEmbed =
  | { id?: unknown; name?: string; sort_order?: number }
  | { id?: unknown; name?: string; sort_order?: number }[]
  | null
  | undefined;

function embedCategoryName(v: CatEmbed): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v[0]?.name?.trim() || null;
  return v.name?.trim() || null;
}

function embedMenuSection(v: MenuEmbed): {
  id: string | null;
  name: string | null;
  sort: number;
  hasEmbed: boolean;
} {
  if (v == null) return { id: null, name: null, sort: 9999, hasEmbed: false };
  const o = Array.isArray(v) ? v[0] : v;
  if (!o || typeof o !== "object") return { id: null, name: null, sort: 9999, hasEmbed: false };
  const r = o as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() || null : null;
  const rawId = r.id;
  const id =
    typeof rawId === "string" && rawId.trim()
      ? rawId.trim()
      : rawId != null
        ? String(rawId).trim() || null
        : null;
  const so = Number(r.sort_order);
  const sort = Number.isFinite(so) ? so : 9999;
  return { id, name, sort, hasEmbed: true };
}

export function parseStoreDetailProducts(raw: unknown[]): StoreDetailProductCard[] {
  return raw.map((row) => {
    const o = row as Record<string, unknown>;
    const price = Number(o.price);
    const disc = o.discount_price != null ? Number(o.discount_price) : null;
    const dpctRaw = o.discount_percent;
    const dpct =
      dpctRaw != null && Number.isFinite(Number(dpctRaw)) && Number(dpctRaw) > 0
        ? Math.floor(Number(dpctRaw))
        : null;
    const menu = embedMenuSection(o.store_menu_sections as MenuEmbed);
    const cat = embedCategoryName(o.store_product_categories as CatEmbed);
    const trackInv = o.track_inventory === true;
    let has_options = false;
    if (typeof o.has_options === "boolean") {
      has_options = o.has_options;
    } else {
      try {
        has_options = parseProductOptionsJson(o.options_json).length > 0;
      } catch {
        has_options = false;
      }
    }
    const minRaw = Number(o.min_order_qty);
    const maxRaw = Number(o.max_order_qty);
    const min_order_qty =
      Number.isFinite(minRaw) && minRaw > 0 ? Math.max(1, Math.floor(minRaw)) : 1;
    const max_order_qty =
      Number.isFinite(maxRaw) && maxRaw > 0 ? Math.max(min_order_qty, Math.floor(maxRaw)) : 99;
    const productStatus =
      typeof o.product_status === "string" && o.product_status.trim()
        ? String(o.product_status).trim()
        : "active";
    const sortRaw = Number(o.sort_order);
    const sort_order = Number.isFinite(sortRaw) ? Math.floor(sortRaw) : 0;
    const legacyFeatured = !!o.is_featured;
    const ownerRec =
      typeof o.is_owner_recommended === "boolean" ? !!o.is_owner_recommended : legacyFeatured;
    const representative = typeof o.is_representative === "boolean" ? !!o.is_representative : false;
    const rawSectionFk =
      typeof o.menu_section_id === "string" && o.menu_section_id.trim()
        ? o.menu_section_id.trim()
        : o.menu_section_id != null
          ? String(o.menu_section_id).trim()
          : "";
    const menu_section_id =
      rawSectionFk.length > 0 ? rawSectionFk : menu.id && menu.id.length > 0 ? menu.id : null;
    const prRaw = o.popular_rank;
    const popular_rank =
      prRaw != null && Number.isFinite(Number(prRaw)) && Number(prRaw) > 0
        ? Math.floor(Number(prRaw))
        : null;
    return {
      id: String(o.id ?? ""),
      title: String(o.title ?? ""),
      summary: o.summary != null ? String(o.summary) : null,
      price: Number.isFinite(price) ? price : 0,
      discount_price: disc != null && Number.isFinite(disc) ? disc : null,
      discount_percent: dpct,
      track_inventory: trackInv,
      stock_qty: Math.max(0, Math.floor(Number(o.stock_qty ?? 0)) || 0),
      thumbnail_url: o.thumbnail_url != null ? String(o.thumbnail_url) : null,
      pickup_available: o.pickup_available != null ? !!o.pickup_available : null,
      local_delivery_available:
        o.local_delivery_available != null ? !!o.local_delivery_available : null,
      shipping_available: o.shipping_available != null ? !!o.shipping_available : null,
      is_featured: legacyFeatured,
      is_owner_recommended: ownerRec,
      is_representative: representative,
      item_type: o.item_type != null ? String(o.item_type) : null,
      categoryName: menu.name ?? cat,
      menu_section_id,
      menuSectionSort: menu.hasEmbed ? menu.sort : 9999,
      sort_order,
      has_options,
      min_order_qty,
      max_order_qty,
      product_status: productStatus,
      popular_rank,
    };
  });
}

/** 공개 매장: 메뉴 구역 순 → 구역 내 sort_order → 제목 */
export function sortStoreDetailProductCardsForDisplay(cards: StoreDetailProductCard[]): StoreDetailProductCard[] {
  return [...cards].sort((a, b) => {
    if (a.menuSectionSort !== b.menuSectionSort) return a.menuSectionSort - b.menuSectionSort;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.title.localeCompare(b.title, "ko");
  });
}

export type MenuSection = {
  heading: string;
  /** 목록 블록 상단 제목(없으면 heading). 상단 칩은 heading 유지 */
  listHeading?: string;
  /** 메뉴 그룹 id (없으면 기타) */
  sectionId?: string | null;
  /** 칩/서버 categories.display_order 정렬용 */
  displayOrder?: number;
  items: StoreDetailProductCard[];
};

const UNCATEGORIZED = "기타 메뉴";
const UNCATEGORIZED_KEY = "__uncategorized__";

function minMenuSectionSort(items: StoreDetailProductCard[]): number {
  let m = Infinity;
  for (const p of items) {
    if (p.menuSectionSort < m) m = p.menuSectionSort;
  }
  return Number.isFinite(m) ? m : 9999;
}

export function cardIsMenuSoldOut(p: StoreDetailProductCard): boolean {
  return p.product_status === "sold_out" || (p.track_inventory && p.stock_qty <= 0);
}

function sortItemsInCategory(items: StoreDetailProductCard[]): StoreDetailProductCard[] {
  return [...items].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.title.localeCompare(b.title, "ko");
  });
}

function sortSectionItemsForSoldOutPolicy(
  items: StoreDetailProductCard[],
  soldOutBottom: boolean
): StoreDetailProductCard[] {
  const base = sortItemsInCategory(items);
  if (!soldOutBottom) return base;
  const inStock = base.filter((p) => !cardIsMenuSoldOut(p));
  const sold = base.filter((p) => cardIsMenuSoldOut(p));
  return [...inStock, ...sold];
}

/** 추천메뉴 스트립: 인기 순서 우선 → 부족 시 사장님 추천만 보충, 최대 5, 중복 없음 */
export const RECOMMENDED_MENU_STRIP_MAX = 5;

export function buildRecommendedStripProductIds(
  popularOrderedIds: string[],
  cards: StoreDetailProductCard[],
  maxItems = RECOMMENDED_MENU_STRIP_MAX
): string[] {
  const cap = maxItems <= 0 ? RECOMMENDED_MENU_STRIP_MAX : Math.min(RECOMMENDED_MENU_STRIP_MAX, Math.floor(maxItems));
  const byId = new Map(cards.map((c) => [c.id, c]));
  const out: string[] = [];
  const seen = new Set<string>();

  for (const rawId of popularOrderedIds) {
    if (out.length >= cap) break;
    const id = String(rawId ?? "").trim();
    if (!id) continue;
    const c = byId.get(id);
    if (!c) continue;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c.id);
  }

  const ownerPool = cards
    .filter((p) => p.is_owner_recommended && !seen.has(p.id))
    .sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.title.localeCompare(b.title, "ko");
    });

  for (const p of ownerPool) {
    if (out.length >= cap) break;
    seen.add(p.id);
    out.push(p.id);
  }

  return out;
}

/** 사장님 추천·대표 플래그 상단 섹션(레거시) — 신규 스트립은 buildRecommendedStripProductIds */
export function sliceRecommendedMenuProducts(
  cards: StoreDetailProductCard[],
  maxItems: number
): StoreDetailProductCard[] {
  const cap = maxItems <= 0 ? 10 : Math.min(30, Math.floor(maxItems));
  return sortItemsInCategory(
    cards.filter((p) => p.is_owner_recommended || p.is_representative)
  ).slice(0, cap);
}

/** 주문 집계 순서대로 인기 상품 카드 나열(미포함 id는 스킵) */
export function slicePopularMenuProducts(
  cards: StoreDetailProductCard[],
  stats: { product_id: string; total_qty: number }[],
  minQty: number
): StoreDetailProductCard[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const out: StoreDetailProductCard[] = [];
  for (const s of stats) {
    if (s.total_qty < minQty) continue;
    const c = byId.get(s.product_id);
    if (!c) continue;
    if (c.product_status !== "active" && c.product_status !== "sold_out") continue;
    out.push(c);
  }
  return out;
}

/**
 * 메뉴 그룹(`menu_section_id`) 기준 — 동일 product row 한 번만 포함.
 * `soldOutBottom`: 품절을 구역 내 하단으로.
 */
export function groupStoreProductsByMenuSectionModel(
  products: StoreDetailProductCard[],
  soldOutBottom: boolean
): MenuSection[] {
  type Acc = {
    items: StoreDetailProductCard[];
    minSort: number;
    heading: string;
    sectionId: string | null;
  };
  const byKey = new Map<string, Acc>();

  for (const p of products) {
    const key =
      p.menu_section_id && p.menu_section_id.length > 0 ? p.menu_section_id : UNCATEGORIZED_KEY;
    if (!byKey.has(key)) {
      byKey.set(key, {
        items: [],
        minSort: p.menuSectionSort,
        heading: (p.categoryName && p.categoryName.trim()) || UNCATEGORIZED,
        sectionId: key === UNCATEGORIZED_KEY ? null : key,
      });
    }
    const acc = byKey.get(key)!;
    acc.items.push(p);
    if (p.menuSectionSort < acc.minSort) acc.minSort = p.menuSectionSort;
    if (p.categoryName && p.categoryName.trim()) acc.heading = p.categoryName.trim();
  }

  const keys = [...byKey.keys()].filter((k) => k !== UNCATEGORIZED_KEY);
  keys.sort((a, b) => {
    const da = byKey.get(a)!.minSort;
    const db = byKey.get(b)!.minSort;
    if (da !== db) return da - db;
    return a.localeCompare(b);
  });

  const sections: MenuSection[] = keys.map((k) => {
    const acc = byKey.get(k)!;
    return {
      heading: acc.heading,
      sectionId: acc.sectionId,
      displayOrder: acc.minSort,
      items: sortSectionItemsForSoldOutPolicy(acc.items, soldOutBottom),
    };
  });

  if (byKey.has(UNCATEGORIZED_KEY)) {
    const acc = byKey.get(UNCATEGORIZED_KEY)!;
    if (acc.items.length > 0) {
      sections.push({
        heading: acc.heading,
        sectionId: null,
        displayOrder: acc.minSort,
        items: sortSectionItemsForSoldOutPolicy(acc.items, soldOutBottom),
      });
    }
  }

  return sections;
}

/** browse·검색 `focusProduct` — 해당 상품이 속한 카테고리 구역에서 맨 위로 */
export function pinFocusedProductInMenuSections(
  sections: MenuSection[],
  productId: string
): MenuSection[] {
  const id = productId.trim();
  if (!id) return sections;
  return sections.map((section) => {
    const idx = section.items.findIndex((p) => p.id === id);
    if (idx <= 0) return section;
    const items = [...section.items];
    const picked = items[idx];
    if (!picked) return section;
    items.splice(idx, 1);
    return { ...section, items: [picked, ...items] };
  });
}

export function findMenuSectionIndexForProduct(
  sections: MenuSection[],
  productId: string
): number {
  const id = productId.trim();
  if (!id) return -1;
  return sections.findIndex((s) => s.items.some((p) => p.id === id));
}

/**
 * 실제 메뉴 구역(카테고리)만 — 추천/인기와 무관하게 **전체** 상품을 한 번씩만 포함.
 * @deprecated 메뉴 그룹 id 기준은 `groupStoreProductsByMenuSectionModel` 사용
 */
export function groupStoreProductsByMenuSection(products: StoreDetailProductCard[]): MenuSection[] {
  const sectionOrder: string[] = [];
  const bySection = new Map<string, StoreDetailProductCard[]>();

  for (const p of products) {
    const key = p.categoryName && p.categoryName.length > 0 ? p.categoryName : UNCATEGORIZED;
    if (!bySection.has(key)) {
      sectionOrder.push(key);
      bySection.set(key, []);
    }
    bySection.get(key)!.push(p);
  }

  const restHeadings = sectionOrder.filter((h) => h !== UNCATEGORIZED);
  restHeadings.sort((a, b) => {
    const da = minMenuSectionSort(bySection.get(a) ?? []);
    const db = minMenuSectionSort(bySection.get(b) ?? []);
    if (da !== db) return da - db;
    return a.localeCompare(b, "ko");
  });

  const sections: MenuSection[] = restHeadings.map((heading) => ({
    heading,
    items: sortItemsInCategory(bySection.get(heading) ?? []),
  }));
  if (bySection.has(UNCATEGORIZED) && (bySection.get(UNCATEGORIZED)?.length ?? 0) > 0) {
    sections.push({
      heading: UNCATEGORIZED,
      items: sortItemsInCategory(bySection.get(UNCATEGORIZED)!),
    });
  }
  return sections;
}
