/**
 * Owner products list — slim snapshot (no PostgREST embed fan-out).
 * Shared by GET route + RSC bootstrap. Sort: DB order (featured → sort_order → created_at).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { runSingleFlight } from "@/lib/http/run-single-flight";

/** List GET / RSC — embed 제거·배치 attach. 상세 필드(options_json·images_json·description_html) 제외. */
export const OWNER_PRODUCTS_LIST_SELECT =
  [
    "id",
    "store_id",
    "title",
    "summary",
    "price",
    "discount_price",
    "discount_percent",
    "stock_qty",
    "track_inventory",
    "thumbnail_url",
    "product_status",
    "pickup_available",
    "local_delivery_available",
    "shipping_available",
    "category_id",
    "menu_section_id",
    "item_type",
    "is_featured",
    "is_owner_recommended",
    "is_representative",
    "sort_order",
    "created_at",
    "updated_at",
  ].join(", ");

export const OWNER_PRODUCTS_SECTION_FILTER_SELECT = "id, menu_section_id";

export type OwnerProductsListRow = Record<string, unknown>;

export type OwnerProductsListSnapshotTiming = {
  products_query_ms: number;
  categories_query_ms: number;
  sections_query_ms: number;
  sort_ms: number;
};

export type OwnerProductsListSnapshot = {
  products: OwnerProductsListRow[];
  timing: OwnerProductsListSnapshotTiming;
  options_embed: 0;
  images_embed: 0;
  cache_hit: 0 | 1;
  singleflight_hit: 0 | 1;
};

/** POST/PATCH invalidate — warm 허브 폴링은 ownership TTL(30s)과 맞춤 */
export const OWNER_PRODUCTS_LIST_CACHE_TTL_MS = 30_000;

type CacheEntry = {
  expiresAt: number;
  value: Omit<OwnerProductsListSnapshot, "cache_hit" | "singleflight_hit">;
};

type OwnerProductsListCacheGlobal = {
  __samarketOwnerProductsListCache?: Map<string, CacheEntry>;
};

function cacheMap(): Map<string, CacheEntry> {
  const g = globalThis as OwnerProductsListCacheGlobal;
  if (!g.__samarketOwnerProductsListCache) {
    g.__samarketOwnerProductsListCache = new Map();
  }
  return g.__samarketOwnerProductsListCache;
}

export function invalidateOwnerProductsListCache(storeId?: string): void {
  const map = cacheMap();
  if (!storeId?.trim()) {
    map.clear();
    return;
  }
  const sid = storeId.trim();
  for (const key of map.keys()) {
    if (key.startsWith(`${sid}:`)) map.delete(key);
  }
}

function cacheKey(
  storeId: string,
  sectionFilter: string,
  limit: number | undefined,
  cursor: string
): string {
  return `${storeId}:${sectionFilter || "_"}:${limit ?? "all"}:${cursor || "_"}`;
}

function peekCache(key: string): Omit<OwnerProductsListSnapshot, "cache_hit" | "singleflight_hit"> | null {
  const hit = cacheMap().get(key);
  if (!hit || hit.expiresAt <= Date.now()) {
    if (hit) cacheMap().delete(key);
    return null;
  }
  return hit.value;
}

function storeCache(
  key: string,
  value: Omit<OwnerProductsListSnapshot, "cache_hit" | "singleflight_hit">
): void {
  cacheMap().set(key, { expiresAt: Date.now() + OWNER_PRODUCTS_LIST_CACHE_TTL_MS, value });
}

export function peekOwnerProductsListCacheHit(
  storeId: string,
  opts?: { sectionFilter?: string; limit?: number; cursor?: string }
): boolean {
  const sid = storeId.trim();
  const sectionFilter = (opts?.sectionFilter ?? "").trim();
  const limit = opts?.limit;
  const cursor = (opts?.cursor ?? "").trim();
  const useCache = !sectionFilter && limit == null && !cursor;
  if (!useCache) return false;
  const key = cacheKey(sid, sectionFilter, limit, cursor);
  return peekCache(key) != null;
}

function zeroListTiming(): OwnerProductsListSnapshotTiming {
  return {
    products_query_ms: 0,
    categories_query_ms: 0,
    sections_query_ms: 0,
    sort_ms: 0,
  };
}

function snapshotFromCache(
  peeked: Omit<OwnerProductsListSnapshot, "cache_hit" | "singleflight_hit">,
  singleflight_hit: 0 | 1
): OwnerProductsListSnapshot {
  return {
    products: peeked.products,
    timing: zeroListTiming(),
    options_embed: 0,
    images_embed: 0,
    cache_hit: 1,
    singleflight_hit,
  };
}

function perfNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function attachCategoryEmbeds(
  products: OwnerProductsListRow[],
  cats: { id: string; name: string | null; slug: string | null }[]
): OwnerProductsListRow[] {
  if (cats.length === 0) return products;
  const byId = new Map(cats.map((c) => [c.id, { name: c.name, slug: c.slug }]));
  return products.map((row) => {
    const cid = row.category_id != null ? String(row.category_id).trim() : "";
    if (!cid || !byId.has(cid)) return row;
    return { ...row, store_product_categories: byId.get(cid) };
  });
}

function attachMenuSectionEmbeds(
  products: OwnerProductsListRow[],
  sections: { id: string; name: string | null; sort_order: number; is_hidden: boolean }[]
): OwnerProductsListRow[] {
  if (sections.length === 0) return products;
  const byId = new Map(
    sections.map((s) => [
      s.id,
      { id: s.id, name: s.name, sort_order: s.sort_order, is_hidden: s.is_hidden },
    ])
  );
  return products.map((row) => {
    const sid = row.menu_section_id != null ? String(row.menu_section_id).trim() : "";
    if (!sid || !byId.has(sid)) return row;
    return { ...row, store_menu_sections: byId.get(sid) };
  });
}

async function loadOwnerProductsListSnapshotUncached(
  sb: SupabaseClient<any>,
  storeId: string,
  opts: {
    sectionFilter: string;
    limit?: number;
    cursor?: string;
  }
): Promise<
  | { ok: true; snapshot: Omit<OwnerProductsListSnapshot, "cache_hit" | "singleflight_hit"> }
  | { ok: false; error: string }
> {
  const sectionFilter = opts.sectionFilter;
  const isSectionScoped = sectionFilter.length >= 8;
  const selectCols = isSectionScoped ? OWNER_PRODUCTS_SECTION_FILTER_SELECT : OWNER_PRODUCTS_LIST_SELECT;

  const tProducts0 = perfNow();
  let pq = sb
    .from("store_products")
    .select(selectCols)
    .eq("store_id", storeId)
    .not("product_status", "eq", "deleted");

  if (isSectionScoped) {
    pq = pq.eq("menu_section_id", sectionFilter);
  }

  if (opts.limit != null && opts.limit > 0) {
    pq = pq.limit(opts.limit);
  }

  pq = pq
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const { data: products, error: pErr } = await pq;
  const products_query_ms = Math.round(perfNow() - tProducts0);

  if (pErr) {
    return { ok: false, error: pErr.message };
  }

  let rows = (products ?? []) as unknown as OwnerProductsListRow[];

  if (isSectionScoped) {
    return {
      ok: true,
      snapshot: {
        products: rows,
        timing: {
          products_query_ms,
          categories_query_ms: 0,
          sections_query_ms: 0,
          sort_ms: 0,
        },
        options_embed: 0,
        images_embed: 0,
      },
    };
  }

  const categoryIds = [
    ...new Set(
      rows
        .map((r) => (r.category_id != null ? String(r.category_id).trim() : ""))
        .filter((id) => id.length > 0)
    ),
  ];
  const sectionIds = [
    ...new Set(
      rows
        .map((r) => (r.menu_section_id != null ? String(r.menu_section_id).trim() : ""))
        .filter((id) => id.length > 0)
    ),
  ];

  const tAttach0 = perfNow();
  const [catRes, secRes] = await Promise.all([
    categoryIds.length > 0
      ? sb.from("store_product_categories").select("id, name, slug").in("id", categoryIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null; slug: string | null }[], error: null }),
    sectionIds.length > 0
      ? sb
          .from("store_menu_sections")
          .select("id, name, sort_order, is_hidden")
          .eq("store_id", storeId)
          .in("id", sectionIds)
      : Promise.resolve({
          data: [] as { id: string; name: string | null; sort_order: number; is_hidden: boolean }[],
          error: null,
        }),
  ]);
  const attachWall = Math.round(perfNow() - tAttach0);
  const categories_query_ms =
    categoryIds.length > 0 ? attachWall : 0;
  const sections_query_ms = sectionIds.length > 0 ? attachWall : 0;

  if (catRes.error) {
    return { ok: false, error: catRes.error.message };
  }
  if (secRes.error) {
    return { ok: false, error: secRes.error.message };
  }

  const tSort0 = perfNow();
  rows = attachMenuSectionEmbeds(
    attachCategoryEmbeds(
      rows,
      (catRes.data ?? []) as { id: string; name: string | null; slug: string | null }[]
    ),
    (secRes.data ?? []).map((s) => ({
      id: String(s.id),
      name: s.name != null ? String(s.name) : null,
      sort_order: Number(s.sort_order) || 0,
      is_hidden: s.is_hidden === true,
    }))
  );
  const sort_ms = Math.round(perfNow() - tSort0);

  return {
    ok: true,
    snapshot: {
      products: rows,
      timing: {
        products_query_ms,
        categories_query_ms,
        sections_query_ms,
        sort_ms,
      },
      options_embed: 0,
      images_embed: 0,
    },
  };
}

export function parseOwnerProductsListLimit(raw: string | null): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.min(100, n);
}

export async function loadOwnerProductsListSnapshot(
  sb: SupabaseClient<any>,
  storeId: string,
  opts?: {
    sectionFilter?: string;
    limit?: number;
    cursor?: string;
    skipCache?: boolean;
  }
): Promise<
  | { ok: true; snapshot: OwnerProductsListSnapshot }
  | { ok: false; error: string }
> {
  const sid = storeId.trim();
  const sectionFilter = (opts?.sectionFilter ?? "").trim();
  const limit = opts?.limit;
  const cursor = (opts?.cursor ?? "").trim();
  const key = cacheKey(sid, sectionFilter, limit, cursor);
  const useCache = !opts?.skipCache && !sectionFilter && !limit && !cursor;

  if (useCache) {
    const peeked = peekCache(key);
    if (peeked) {
      return {
        ok: true,
        snapshot: snapshotFromCache(peeked, 0),
      };
    }
  }

  let singleflight_hit: 0 | 1 = 0;
  const flightKey = `owner-products-list:${key}`;

  const loaded = await runSingleFlight(flightKey, async () => {
    if (useCache) {
      const again = peekCache(key);
      if (again) {
        singleflight_hit = 1;
        return {
          ok: true as const,
          snapshot: snapshotFromCache(again, 1),
          fromFlightPeek: true,
        };
      }
    }
    const uncached = await loadOwnerProductsListSnapshotUncached(sb, sid, {
      sectionFilter,
      limit,
      cursor,
    });
    if (!uncached.ok) return uncached;
    if (useCache) storeCache(key, uncached.snapshot);
    return { ok: true as const, snapshot: uncached.snapshot, fromFlightPeek: false };
  });

  if (!loaded.ok) return loaded;

  if ("fromFlightPeek" in loaded && loaded.fromFlightPeek) {
    return { ok: true, snapshot: loaded.snapshot as OwnerProductsListSnapshot };
  }

  const cold = loaded.snapshot as Omit<OwnerProductsListSnapshot, "cache_hit" | "singleflight_hit">;
  return {
    ok: true,
    snapshot: {
      ...cold,
      cache_hit: 0,
      singleflight_hit,
    },
  };
}
