"use client";

import {
  buildOwnerRecommendedStripProductIds,
  groupStoreProductsByMenuSectionModel,
  parseStoreDetailProducts,
  RECOMMENDED_MENU_STRIP_MAX,
  sortStoreDetailProductCardsForDisplay,
  type StoreDetailProductCard,
} from "@/lib/stores/group-store-products-by-menu";
import type { StoreMenusPayload } from "@/lib/stores/store-detail-split-types";
import { storePublicProductRowsMap } from "@/lib/stores/store-public-page-hydrate";
import {
  createMenuNormalizeBreakdown,
  logDeliveryMenuDeferredNormalizeComplete,
  logDeliveryMenuNormalizeBreakdown,
  logDeliveryMenuNormalizeChunk,
  type DeliveryMenuNormalizeBreakdown,
} from "@/lib/dibay/delivery-menu-normalize-breakdown";

function msSince(start: number): number {
  return Math.max(0, Math.round(performance.now() - start));
}
import type { StoreMenusCoreApply, StoreMenusStripsApply } from "@/lib/dibay/split-store-menus-payload";

export const MENU_NORMALIZE_DEFER_THRESHOLD = 56;
export const MENU_NORMALIZE_CHUNK_SIZE = 40;

const UNCATEGORIZED_KEY = "__uncategorized__";

type MenuEmbed =
  | { id?: unknown; name?: string; sort_order?: number; is_hidden?: boolean }
  | { id?: unknown; name?: string; sort_order?: number; is_hidden?: boolean }[]
  | null
  | undefined;

function embedMenuSection(v: MenuEmbed): {
  id: string | null;
  name: string | null;
  sort: number;
  hidden: boolean;
} {
  if (v == null) return { id: null, name: null, sort: 9999, hidden: false };
  const o = Array.isArray(v) ? v[0] : v;
  if (!o || typeof o !== "object") return { id: null, name: null, sort: 9999, hidden: false };
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
  const hidden = r.is_hidden === true;
  return { id, name, sort, hidden };
}

function rowSectionKey(row: Record<string, unknown>): string {
  const menu = embedMenuSection(row.store_menu_sections as MenuEmbed);
  if (menu.id && menu.id.length > 0) return menu.id;
  const rawFk =
    typeof row.menu_section_id === "string" && row.menu_section_id.trim()
      ? row.menu_section_id.trim()
      : "";
  return rawFk.length > 0 ? rawFk : UNCATEGORIZED_KEY;
}

function findFirstSectionKey(raw: unknown[]): string {
  let bestKey = UNCATEGORIZED_KEY;
  let bestSort = Infinity;
  for (const item of raw) {
    const row = item as Record<string, unknown>;
    const menu = embedMenuSection(row.store_menu_sections as MenuEmbed);
    if (menu.hidden) continue;
    const key = rowSectionKey(row);
    if (menu.sort < bestSort) {
      bestSort = menu.sort;
      bestKey = key;
    }
  }
  return bestKey;
}

function shouldParseRowForViewport(
  row: Record<string, unknown>,
  firstSectionKey: string,
  priorityIds: Set<string>
): boolean {
  const id = String(row.id ?? "").trim();
  if (id && priorityIds.has(id)) return true;
  if (embedMenuSection(row.store_menu_sections as MenuEmbed).hidden) return false;
  return rowSectionKey(row) === firstSectionKey;
}

function applyPopularRanks(
  cards: StoreDetailProductCard[],
  popIds: string[]
): StoreDetailProductCard[] {
  if (popIds.length === 0) return cards;
  const byId = new Map(cards.map((c) => [c.id, c]));
  const popularRankById = new Map<string, number>();
  popIds.forEach((id, i) => {
    if (byId.has(id)) popularRankById.set(id, i + 1);
  });
  return cards.map((p) => {
    const r = popularRankById.get(p.id);
    return r != null && r > 0 ? { ...p, popular_rank: r } : { ...p, popular_rank: p.popular_rank ?? null };
  });
}

function pickFirstSectionCards(cards: StoreDetailProductCard[]): StoreDetailProductCard[] {
  if (cards.length === 0) return [];
  let minSort = Infinity;
  for (const c of cards) {
    if (c.menuSectionSort < minSort) minSort = c.menuSectionSort;
  }
  const section = cards.filter((c) => c.menuSectionSort === minSort);
  return sortStoreDetailProductCardsForDisplay(section);
}

function buildStrips(
  menuParsed: StoreMenusPayload,
  cards: StoreDetailProductCard[],
  breakdown: DeliveryMenuNormalizeBreakdown
): StoreMenusStripsApply {
  const popIds = Array.isArray(menuParsed.popularProductIds) ? menuParsed.popularProductIds : [];
  const stripCap = Math.min(
    RECOMMENDED_MENU_STRIP_MAX,
    Math.max(
      1,
      Math.floor(Number(menuParsed.meta?.popular_menu?.recommended_max)) || RECOMMENDED_MENU_STRIP_MAX
    )
  );

  const popStart = performance.now();
  const byId = new Map(cards.map((c) => [c.id, c]));
  const popularMenuCards = popIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((c, i) => ({ ...(c as StoreDetailProductCard), popular_rank: i + 1 }));
  breakdown.popular_build_ms += msSince(popStart);

  const recStart = performance.now();
  const recIds = buildOwnerRecommendedStripProductIds(cards, stripCap, popIds);
  const popularRankById = new Map(popularMenuCards.map((c) => [c.id, c.popular_rank ?? 0]));
  const recommendedMenuCards = recIds
    .map((id) => {
      const c = byId.get(id);
      if (!c) return null;
      const r = popularRankById.get(id);
      return r != null && r > 0 ? { ...c, popular_rank: r } : { ...c, popular_rank: c.popular_rank ?? null };
    })
    .filter(Boolean) as StoreDetailProductCard[];
  breakdown.recommended_build_ms += msSince(recStart);

  return {
    recommendedMenuCards,
    popularMenuCards,
    favoriteSeed: {
      viewerFavorited: !!menuParsed.meta?.viewer_favorited,
      favoriteCount: Number(menuParsed.meta?.favorite_count) || 0,
    },
    recentOrderCountMeta: Number(menuParsed.meta?.recent_order_count) || 0,
  };
}

function buildCoreMeta(menuParsed: StoreMenusPayload) {
  const sob =
    menuParsed.meta?.menu_sold_out_bottom === true ||
    menuParsed.store?.menu_sold_out_bottom === true;
  return {
    canSell: !!menuParsed.meta?.canSell,
    menuSoldOutBottom: sob,
  };
}

function normalizeSyncFull(
  menuParsed: StoreMenusPayload,
  slug: string
): {
  viewport: StoreMenusCoreApply;
  strips: StoreMenusStripsApply;
  breakdown: DeliveryMenuNormalizeBreakdown;
  scheduleFullCatalog: (onFull: (full: StoreMenusCoreApply) => void) => void;
} {
  const breakdown = createMenuNormalizeBreakdown(slug);
  const totalStart = performance.now();
  const raw = menuParsed.products ?? [];
  const popIds = Array.isArray(menuParsed.popularProductIds) ? menuParsed.popularProductIds : [];

  const parseStart = performance.now();
  let parsed = parseStoreDetailProducts(raw);
  breakdown.parse_products_ms = msSince(parseStart);

  const sortStart = performance.now();
  parsed = sortStoreDetailProductCardsForDisplay(parsed);
  parsed = applyPopularRanks(parsed, popIds);
  breakdown.sort_products_ms = msSince(sortStart);

  const groupStart = performance.now();
  const sections = groupStoreProductsByMenuSectionModel(parsed, buildCoreMeta(menuParsed).menuSoldOutBottom);
  breakdown.group_sections_ms = msSince(groupStart);
  breakdown.product_count = parsed.length;
  breakdown.category_count = sections.length;

  const meta = buildCoreMeta(menuParsed);
  const strips = buildStrips(menuParsed, parsed, breakdown);

  const viewport: StoreMenusCoreApply = {
    products: parsed,
    productRowsById: storePublicProductRowsMap(raw),
    canSell: meta.canSell,
    menuSoldOutBottom: meta.menuSoldOutBottom,
  };

  breakdown.viewport_only = false;
  breakdown.total_ms = msSince(totalStart);
  logDeliveryMenuNormalizeBreakdown(breakdown);

  return {
    viewport,
    strips,
    breakdown,
    scheduleFullCatalog: (onFull) => onFull(viewport),
  };
}

function normalizeViewportFirst(
  menuParsed: StoreMenusPayload,
  slug: string
): {
  viewport: StoreMenusCoreApply;
  strips: StoreMenusStripsApply;
  breakdown: DeliveryMenuNormalizeBreakdown;
  scheduleFullCatalog: (onFull: (full: StoreMenusCoreApply) => void) => void;
} {
  const breakdown = createMenuNormalizeBreakdown(slug);
  const totalStart = performance.now();
  const raw = menuParsed.products ?? [];
  const popIds = Array.isArray(menuParsed.popularProductIds) ? menuParsed.popularProductIds : [];
  const recIds = Array.isArray(menuParsed.recommendedProductIds)
    ? menuParsed.recommendedProductIds
    : [];
  const priorityIds = new Set([...popIds, ...recIds].map((id) => String(id ?? "").trim()).filter(Boolean));
  const firstSectionKey = findFirstSectionKey(raw);

  const viewportRaw: unknown[] = [];
  const deferredRaw: unknown[] = [];

  for (const item of raw) {
    const row = item as Record<string, unknown>;
    if (shouldParseRowForViewport(row, firstSectionKey, priorityIds)) {
      viewportRaw.push(item);
    } else {
      deferredRaw.push(item);
    }
  }

  const parseStart = performance.now();
  const viewportParsed = parseStoreDetailProducts(viewportRaw);
  breakdown.parse_products_ms = msSince(parseStart);

  const sortStart = performance.now();
  const firstSection = pickFirstSectionCards(viewportParsed);
  const stripPool = applyPopularRanks(viewportParsed, popIds);
  breakdown.sort_products_ms = msSince(sortStart);

  const groupStart = performance.now();
  const sections = groupStoreProductsByMenuSectionModel(
    firstSection,
    buildCoreMeta(menuParsed).menuSoldOutBottom
  );
  breakdown.group_sections_ms = msSince(groupStart);
  breakdown.product_count = raw.length;
  breakdown.category_count = sections.length;

  const meta = buildCoreMeta(menuParsed);
  const strips = buildStrips(menuParsed, stripPool, breakdown);

  const viewport: StoreMenusCoreApply = {
    products: firstSection,
    productRowsById: storePublicProductRowsMap(viewportRaw),
    canSell: meta.canSell,
    menuSoldOutBottom: meta.menuSoldOutBottom,
  };

  breakdown.viewport_only = true;
  breakdown.total_ms = msSince(totalStart);
  logDeliveryMenuNormalizeBreakdown(breakdown);

  const scheduleFullCatalog = (onFull: (full: StoreMenusCoreApply) => void) => {
    if (typeof window === "undefined") {
      onFull(viewport);
      return;
    }

    const merged = [...viewportParsed];
    const mergedIds = new Set(merged.map((c) => c.id));
    let offset = 0;

    const runChunk = () => {
      if (offset >= deferredRaw.length) {
        let full = sortStoreDetailProductCardsForDisplay(merged);
        full = applyPopularRanks(full, popIds);
        const fullSections = groupStoreProductsByMenuSectionModel(full, meta.menuSoldOutBottom);
        logDeliveryMenuDeferredNormalizeComplete({
          slug,
          product_count: full.length,
          category_count: fullSections.length,
          deferred_rows: deferredRaw.length,
        });
        onFull({
          products: full,
          productRowsById: storePublicProductRowsMap(raw),
          canSell: meta.canSell,
          menuSoldOutBottom: meta.menuSoldOutBottom,
        });
        return;
      }

      const slice = deferredRaw.slice(offset, offset + MENU_NORMALIZE_CHUNK_SIZE);
      offset += slice.length;
      logDeliveryMenuNormalizeChunk({
        slug,
        offset,
        chunk_size: slice.length,
        remaining: Math.max(0, deferredRaw.length - offset),
      });

      const chunkCards = parseStoreDetailProducts(slice);
      for (const c of chunkCards) {
        if (!mergedIds.has(c.id)) {
          merged.push(c);
          mergedIds.add(c.id);
        }
      }

      const schedule =
        typeof requestIdleCallback === "function"
          ? (fn: () => void) => requestIdleCallback(fn, { timeout: 120 })
          : (fn: () => void) => setTimeout(fn, 0);

      schedule(runChunk);
    };

    const schedule =
      typeof requestIdleCallback === "function"
        ? (fn: () => void) => requestIdleCallback(fn, { timeout: 120 })
        : (fn: () => void) => setTimeout(fn, 0);

    schedule(runChunk);
  };

  return { viewport, strips, breakdown, scheduleFullCatalog };
}

export function normalizeStoreMenusForClient(
  menuParsed: StoreMenusPayload,
  slug: string
): {
  viewport: StoreMenusCoreApply;
  strips: StoreMenusStripsApply;
  breakdown: DeliveryMenuNormalizeBreakdown;
  scheduleFullCatalog: (onFull: (full: StoreMenusCoreApply) => void) => void;
} {
  const raw = menuParsed.products ?? [];
  if (raw.length <= MENU_NORMALIZE_DEFER_THRESHOLD) {
    return normalizeSyncFull(menuParsed, slug);
  }
  return normalizeViewportFirst(menuParsed, slug);
}
