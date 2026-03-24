/** API 응답의 store_products 행(임베드 포함) → 카드용 + 그룹핑 */

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
};

type CatEmbed = { name?: string } | { name?: string }[] | null | undefined;
type MenuEmbed = { name?: string; sort_order?: number } | { name?: string; sort_order?: number }[] | null | undefined;

function embedCategoryName(v: CatEmbed): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v[0]?.name?.trim() || null;
  return v.name?.trim() || null;
}

function embedMenuSection(v: MenuEmbed): { name: string | null; sort: number } {
  if (v == null) return { name: null, sort: 9999 };
  const o = Array.isArray(v) ? v[0] : v;
  if (!o || typeof o !== "object") return { name: null, sort: 9999 };
  const r = o as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() || null : null;
  const so = Number(r.sort_order);
  return { name, sort: Number.isFinite(so) ? so : 9999 };
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
      menuSectionSort: menu.name ? menu.sort : 9999,
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

export type MenuSection = { heading: string; items: StoreDetailProductCard[] };

const UNCATEGORIZED = "기타 메뉴";

/**
 * API가 이미 대표·sort_order 순으로 정렬해 두었다고 가정하고,
 * 첫 등장 순서대로 섹션 헤더를 만든다. 미분류는 마지막으로 보낸다.
 */
export function groupStoreProductsByMenuSection(
  products: StoreDetailProductCard[]
): MenuSection[] {
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

  const rest = sectionOrder.filter((h) => h !== UNCATEGORIZED);
  const sections: MenuSection[] = rest.map((heading) => ({
    heading,
    items: bySection.get(heading) ?? [],
  }));
  if (bySection.has(UNCATEGORIZED) && (bySection.get(UNCATEGORIZED)?.length ?? 0) > 0) {
    sections.push({ heading: UNCATEGORIZED, items: bySection.get(UNCATEGORIZED)! });
  }
  return sections;
}
