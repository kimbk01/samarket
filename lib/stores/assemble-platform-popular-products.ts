import type { StorePopularProductStatRow } from "@/lib/stores/load-store-popular-product-stats-batch";

/** Active catalog row for platform popular join — no extra per-product queries */
export type ActiveProductCatalogEntry = {
  productId: string;
  name: string;
  price: number;
  imageUrl: string | null;
};

/** Stats-backed platform popular product — surface-neutral (HOME shelf / BROWSE row) */
export type PlatformPopularProduct = {
  productId: string;
  name: string;
  price: number;
  imageUrl: string | null;
  totalQty: number;
  popularRank: number;
  windowDays: number;
};

/** Same window contract as legacy `queryStorePopularMenuStats` */
export function resolvePopularMenuStatsSinceIso(windowDays: number): string {
  const days = Math.max(1, Math.min(365, Math.floor(windowDays)));
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * Ranked stats → active catalog match → min_qty → first eligible per rank order.
 * Skips inactive/missing catalog rows without aborting lower ranks.
 */
export function assemblePlatformPopularProductsForStore(
  statRows: readonly StorePopularProductStatRow[],
  catalogByProductId: ReadonlyMap<string, ActiveProductCatalogEntry> | undefined,
  minQty: number,
  windowDays: number
): PlatformPopularProduct[] {
  if (!catalogByProductId || catalogByProductId.size === 0) return [];

  const min = Math.max(1, Math.floor(minQty));
  const out: PlatformPopularProduct[] = [];

  for (const row of statRows) {
    if (row.totalQty < min) continue;
    const catalog = catalogByProductId.get(row.productId);
    if (!catalog) continue;
    out.push({
      productId: catalog.productId,
      name: catalog.name,
      price: catalog.price,
      imageUrl: catalog.imageUrl,
      totalQty: row.totalQty,
      popularRank: row.popularRank,
      windowDays,
    });
  }

  return out;
}

export function resolveFirstPlatformPopularProduct(
  statRows: readonly StorePopularProductStatRow[],
  catalogByProductId: ReadonlyMap<string, ActiveProductCatalogEntry> | undefined,
  minQty: number,
  windowDays: number
): PlatformPopularProduct | null {
  return assemblePlatformPopularProductsForStore(statRows, catalogByProductId, minQty, windowDays)[0] ?? null;
}

export function buildActiveProductCatalogMap(
  products: readonly {
    id: string;
    store_id: string;
    title: string;
    price: number;
    thumbnail_url: string | null;
  }[],
  resolveImageUrl: (thumbnail: string | null) => string | null
): Map<string, Map<string, ActiveProductCatalogEntry>> {
  const byStore = new Map<string, Map<string, ActiveProductCatalogEntry>>();
  for (const p of products) {
    const storeId = String(p.store_id).trim();
    const productId = String(p.id).trim();
    if (!storeId || !productId) continue;
    const map = byStore.get(storeId) ?? new Map<string, ActiveProductCatalogEntry>();
    map.set(productId, {
      productId,
      name: p.title,
      price: Number(p.price),
      imageUrl: resolveImageUrl(p.thumbnail_url),
    });
    byStore.set(storeId, map);
  }
  return byStore;
}
