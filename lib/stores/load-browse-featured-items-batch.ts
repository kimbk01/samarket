import type { SupabaseClient } from "@supabase/supabase-js";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import {
  BROWSE_FEATURED_ITEMS_PER_STORE_MAX,
  type BrowseFeaturedItemDto,
} from "@/lib/stores/browse-featured-items-types";
import {
  peekBrowseFeaturedItemsServerCache,
  setBrowseFeaturedItemsServerCache,
} from "@/lib/stores/browse-featured-items-cache";

type ProductRow = {
  id: string;
  store_id: string;
  title: string;
  price: number;
  thumbnail_url: string | null;
  is_featured: boolean | null;
  sort_order: number | null;
  is_owner_recommended?: boolean | null;
};

const PRODUCT_SELECT =
  "id, store_id, title, price, thumbnail_url, is_featured, sort_order, is_owner_recommended";

/** Supabase `.limit` — 배치 32매장 × 매장 6슬롯 이론상한 (분배 손실 여유) */
const BROWSE_FEATURED_ITEMS_QUERY_ROW_CAP = 512;

function badgeForRow(row: ProductRow): string | null {
  if (row.is_featured) return "featured";
  if (row.is_owner_recommended) return "recommended";
  return null;
}

function rowToDto(row: ProductRow): BrowseFeaturedItemDto {
  return {
    id: String(row.id),
    name: String(row.title ?? ""),
    thumbnail_url: row.thumbnail_url?.trim() || null,
    price: Number(row.price) || 0,
    badge: badgeForRow(row),
  };
}

function mergeIntoGrouped(
  grouped: Map<string, ProductRow[]>,
  rows: ProductRow[]
): void {
  for (const p of rows) {
    const sid = String(p.store_id);
    const arr = grouped.get(sid) ?? [];
    const seen = new Set(arr.map((x) => x.id));
    if (!seen.has(p.id)) arr.push(p);
    grouped.set(sid, arr);
  }
}

function capGrouped(grouped: Map<string, ProductRow[]>): Map<string, BrowseFeaturedItemDto[]> {
  const out = new Map<string, BrowseFeaturedItemDto[]>();
  for (const [storeId, arr] of grouped) {
    const sorted = [...arr].sort((a, b) => {
      const f = Number(!!b.is_featured) - Number(!!a.is_featured);
      if (f !== 0) return f;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    out.set(
      storeId,
      sorted.slice(0, BROWSE_FEATURED_ITEMS_PER_STORE_MAX).map(rowToDto)
    );
  }
  return out;
}

function storesNeedingFill(
  storeIds: string[],
  grouped: Map<string, ProductRow[]>
): string[] {
  return storeIds.filter((id) => (grouped.get(id)?.length ?? 0) < BROWSE_FEATURED_ITEMS_PER_STORE_MAX);
}

export type LoadBrowseFeaturedBatchResult = {
  byStoreId: Record<string, { featuredItems: BrowseFeaturedItemDto[] }>;
  dbMs: number;
  transformMs: number;
  cacheHit: boolean;
  queryCount: number;
};

/**
 * storeId 배치 — 캐시 미스만 DB (featured 1회 + 부족 매장 fill 1회, store당 최대 6).
 */
export async function loadBrowseFeaturedItemsBatch(
  sb: SupabaseClient,
  storeIds: string[],
  opts?: { bypassCache?: boolean }
): Promise<LoadBrowseFeaturedBatchResult> {
  const bypassCache = opts?.bypassCache === true;
  const unique = [...new Set(storeIds.map((id) => id.trim()).filter(Boolean))];
  const byStoreId: Record<string, { featuredItems: BrowseFeaturedItemDto[] }> = {};
  for (const id of unique) {
    byStoreId[id] = { featuredItems: [] };
  }

  const misses: string[] = [];
  for (const id of unique) {
    const hit = bypassCache ? undefined : peekBrowseFeaturedItemsServerCache(id);
    if (hit !== undefined) {
      byStoreId[id] = { featuredItems: hit };
    } else {
      misses.push(id);
    }
  }

  if (misses.length === 0) {
    return {
      byStoreId,
      dbMs: 0,
      transformMs: 0,
      cacheHit: true,
      queryCount: 0,
    };
  }

  let queryCount = 0;
  const db0 = devPerfNow();
  const grouped = new Map<string, ProductRow[]>();

  const featuredLimit = Math.min(
    misses.length * BROWSE_FEATURED_ITEMS_PER_STORE_MAX,
    BROWSE_FEATURED_ITEMS_QUERY_ROW_CAP
  );
  const featuredRes = await sb
    .from("store_products")
    .select(PRODUCT_SELECT)
    .in("store_id", misses)
    .eq("product_status", "active")
    .eq("is_featured", true)
    .order("sort_order", { ascending: true })
    .limit(featuredLimit);
  queryCount += 1;
  if (featuredRes.error) {
    throw new Error(featuredRes.error.message);
  }
  mergeIntoGrouped(grouped, (featuredRes.data ?? []) as ProductRow[]);

  const needFill = storesNeedingFill(misses, grouped);
  if (needFill.length > 0) {
    const fillLimit = Math.min(
      needFill.length * BROWSE_FEATURED_ITEMS_PER_STORE_MAX * 2,
      BROWSE_FEATURED_ITEMS_QUERY_ROW_CAP
    );
    const fillRes = await sb
      .from("store_products")
      .select(PRODUCT_SELECT)
      .in("store_id", needFill)
      .eq("product_status", "active")
      .order("sort_order", { ascending: true })
      .limit(fillLimit);
    queryCount += 1;
    if (fillRes.error) {
      throw new Error(fillRes.error.message);
    }
    mergeIntoGrouped(grouped, (fillRes.data ?? []) as ProductRow[]);
  }

  const dbMs = devPerfNow() - db0;
  const transform0 = devPerfNow();
  const capped = capGrouped(grouped);
  for (const id of misses) {
    const items = capped.get(id) ?? [];
    setBrowseFeaturedItemsServerCache(id, items);
    byStoreId[id] = { featuredItems: items };
  }
  const transformMs = devPerfNow() - transform0;

  return {
    byStoreId,
    dbMs,
    transformMs,
    cacheHit: false,
    queryCount,
  };
}
