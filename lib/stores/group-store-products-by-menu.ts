/** API 응답의 store_products 행(임베드 포함) → 카드용 + 그룹핑 */

import { parseProductOptionsJson } from "@/lib/stores/product-line-options";

export function itemTypeShortLabel(item_type: unknown): string | null {
  const t = typeof item_type === "string" ? item_type : null;
  if (t === "menu") return "메뉴";
  if (t === "service") return "서비스";
  if (t === "product") return "상품";
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
  is_featured: boolean;
  item_type: string | null;
  categoryName: string | null;
  /** 매장 전용 메뉴 구역 정렬용 (낮을수록 먼저) */
  menuSectionSort: number;
  /** 옵션 그룹이 1개 이상이면 true (목록에서 뱃지용) */
  has_options: boolean;
  /** 퀵 담기·시트와 동일한 수량 하한·상한 */
  min_order_qty: number;
  max_order_qty: number;
  /** `sold_out` 등 — 구매자 목록 노출 시 담기 비활성 */
  product_status: string;
};

type CatEmbed = { name?: string } | { name?: string }[] | null | undefined;
type MenuEmbed = { name?: string; sort_order?: number } | { name?: string; sort_order?: number }[] | null | undefined;

function embedCategoryName(v: CatEmbed): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v[0]?.name?.trim() || null;
  return v.name?.trim() || null;
}

function embedMenuSection(v: MenuEmbed): { name: string | null; sort: number; hasEmbed: boolean } {
  if (v == null) return { name: null, sort: 9999, hasEmbed: false };
  const o = Array.isArray(v) ? v[0] : v;
  if (!o || typeof o !== "object") return { name: null, sort: 9999, hasEmbed: false };
  const r = o as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() || null : null;
  const so = Number(r.sort_order);
  const sort = Number.isFinite(so) ? so : 9999;
  /** FK 조인 행이 오면 이름이 비어도 sort_order 로 구역 순서를 유지한다 */
  return { name, sort, hasEmbed: true };
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
      is_featured: !!o.is_featured,
      item_type: o.item_type != null ? String(o.item_type) : null,
      categoryName: menu.name ?? cat,
      menuSectionSort: menu.hasEmbed ? menu.sort : 9999,
      has_options,
      min_order_qty,
      max_order_qty,
      product_status: productStatus,
    };
  });
}

/** 공개 매장: 구역 순서 → 대표 메뉴 → 정렬 순서 */
export function sortStoreDetailProductCardsForDisplay(cards: StoreDetailProductCard[]): StoreDetailProductCard[] {
  return [...cards].sort((a, b) => {
    if (a.menuSectionSort !== b.menuSectionSort) return a.menuSectionSort - b.menuSectionSort;
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
    return a.title.localeCompare(b.title, "ko");
  });
}

export type MenuSection = {
  heading: string;
  /** 목록 블록 상단 제목(없으면 heading). 상단 칩은 heading 유지 */
  listHeading?: string;
  items: StoreDetailProductCard[];
};

const UNCATEGORIZED = "기타 메뉴";

function minMenuSectionSort(items: StoreDetailProductCard[]): number {
  let m = Infinity;
  for (const p of items) {
    if (p.menuSectionSort < m) m = p.menuSectionSort;
  }
  return Number.isFinite(m) ? m : 9999;
}

/**
 * 비대표 상품을 구역명(메뉴 구역 → 상품 카테고리 → 기타)으로 묶고,
 * 구역은 `menuSectionSort` 최솟값 기준으로 정렬한다. 미분류는 마지막.
 */
export function groupStoreProductsByMenuSection(
  products: StoreDetailProductCard[]
): MenuSection[] {
  const featured = products.filter((p) => p.is_featured);
  const rest = products.filter((p) => !p.is_featured);

  const sectionOrder: string[] = [];
  const bySection = new Map<string, StoreDetailProductCard[]>();

  for (const p of rest) {
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
    items: bySection.get(heading) ?? [],
  }));
  if (bySection.has(UNCATEGORIZED) && (bySection.get(UNCATEGORIZED)?.length ?? 0) > 0) {
    sections.push({ heading: UNCATEGORIZED, items: bySection.get(UNCATEGORIZED)! });
  }
  if (featured.length > 0) {
    return [
      {
        heading: "인기",
        listHeading: "가장 인기 있는 메뉴",
        items: featured,
      },
      ...sections,
    ];
  }
  return sections;
}
