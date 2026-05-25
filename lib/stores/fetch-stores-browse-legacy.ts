/**
 * Legacy multi-query stores browse builder — taxonomy + stores + related previews.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import { loadBrowseTaxonomySlice } from "@/lib/stores/stores-browse-taxonomy-cache";
import {
  assembleStoresBrowseResponse,
  BROWSE_FEATURED_ITEMS_MAX,
  BROWSE_STORE_FETCH_CAP,
  buildBrowseStoresOrFilter,
  BROWSE_STORE_ROW_SELECTED_COLUMNS,
  resolveBrowseFilteredSortedStoreRows,
  sanitizeForIlikeFragment,
  STORE_ROW_BROWSE_FIELDS,
  type BannerMini,
  type ProductMini,
  type StoresBrowseAssembleResult,
  type StoresBrowseRequestContext,
} from "@/lib/stores/stores-browse-build";
import { gateLegacyFallback } from "@/lib/ops/legacy-fallback-usage-audit";

export type StoresBrowseLegacyEarlyBody =
  | {
      ok: true;
      stores: [];
      meta: {
        source: "supabase";
        primary: string;
        sub: string;
        all_topics: boolean;
        reason: "unknown_primary_slug";
      };
    }
  | {
      ok: true;
      stores: [];
      meta: {
        source: "supabase";
        primary: string;
        sub: string;
        all_topics: false;
        reason: "unknown_topic_slug";
      };
    };

export type StoresBrowseLegacyEarlyResult = {
  ok: true;
  body: StoresBrowseLegacyEarlyBody;
  early: true;
  taxonomyCacheHit: boolean;
  categoryQueryMs: number;
  dbBaseMs: number;
};

export type StoresBrowseLegacySuccessResult = StoresBrowseAssembleResult & {
  ok: true;
  early?: false;
  taxonomyCacheHit: boolean;
  categoryQueryMs: number;
  baseQueryMs: number;
  productPreviewQueryMs: number;
  distanceSortMs: number;
  queryCount: number;
  selectedColumns: string;
};

export type StoresBrowseLegacyErrorResult = {
  ok: false;
  error: string;
};

export type StoresBrowseLegacyResult =
  | StoresBrowseLegacyEarlyResult
  | StoresBrowseLegacySuccessResult
  | StoresBrowseLegacyErrorResult;

export async function buildStoresBrowseLegacy(
  supabase: SupabaseClient,
  ctx: StoresBrowseRequestContext,
): Promise<StoresBrowseLegacyResult> {
  gateLegacyFallback({
    route: "/api/stores/browse",
    fallback_branch: "legacy_taxonomy_stores_wave",
    reason: "unified_rpc_unavailable",
  });
  const { primary, subRaw, wantsAllSubs, sub } = ctx;
  let queryCount = 0;
  const dbBase0 = devPerfNow();
  let taxonomyCacheHit = false;
  let categoryQueryMs = 0;

  let taxonomySlice;
  try {
    const tax0 = devPerfNow();
    const tax = await loadBrowseTaxonomySlice(supabase, primary, subRaw, wantsAllSubs);
    categoryQueryMs = devPerfNow() - tax0;
    taxonomySlice = tax.slice;
    taxonomyCacheHit = tax.cacheHit;
    if (!taxonomyCacheHit) queryCount += 1;
  } catch (taxErr) {
    return {
      ok: false,
      error: taxErr instanceof Error ? taxErr.message : "taxonomy_error",
    };
  }

  if (taxonomySlice.unknownPrimary) {
    return {
      ok: true,
      early: true,
      taxonomyCacheHit,
      categoryQueryMs,
      dbBaseMs: devPerfNow() - dbBase0,
      body: {
        ok: true,
        stores: [],
        meta: {
          source: "supabase",
          primary,
          sub,
          all_topics: wantsAllSubs,
          reason: "unknown_primary_slug",
        },
      },
    };
  }

  if (taxonomySlice.unknownTopic) {
    return {
      ok: true,
      early: true,
      taxonomyCacheHit,
      categoryQueryMs,
      dbBaseMs: devPerfNow() - dbBase0,
      body: {
        ok: true,
        stores: [],
        meta: {
          source: "supabase",
          primary,
          sub,
          all_topics: false,
          reason: "unknown_topic_slug",
        },
      },
    };
  }

  const categoryId = taxonomySlice.categoryId;
  const resolvedTopicId = taxonomySlice.resolvedTopicId;

  const primarySafe = sanitizeForIlikeFragment(primary);
  const cn = sanitizeForIlikeFragment(taxonomySlice.categoryName);
  const orphanOrParts: string[] = [];
  if (primarySafe.length >= 1) {
    orphanOrParts.push(
      `business_type.ilike.%${primarySafe} ·%`,
      `business_type.ilike.%${primarySafe}·%`,
      `business_type.ilike.%${primarySafe} -%`,
      `business_type.ilike.%${primarySafe}-%`,
    );
  }
  if (cn.length >= 1) {
    orphanOrParts.push(
      `business_type.ilike.%${cn} ·%`,
      `business_type.ilike.%${cn}·%`,
      `business_type.ilike.%${cn} -%`,
      `business_type.ilike.%${cn}-%`,
    );
  }

  const storeSelect =
    wantsAllSubs ?
      `${STORE_ROW_BROWSE_FIELDS}, store_topics ( slug, name )`
    : STORE_ROW_BROWSE_FIELDS;

  const storesOr = buildBrowseStoresOrFilter(categoryId, resolvedTopicId, wantsAllSubs, orphanOrParts);

  const baseQuery0 = devPerfNow();
  const { data: storeRowsRaw, error: storesErr } = await supabase
    .from("stores")
    .select(storeSelect)
    .eq("approval_status", "approved")
    .eq("is_visible", true)
    .or(storesOr)
    .limit(BROWSE_STORE_FETCH_CAP);
  const baseQueryMs = devPerfNow() - baseQuery0;
  queryCount += 1;

  if (storesErr) {
    return { ok: false, error: storesErr.message };
  }

  const { rows: sortedRows, distanceSortMs } = resolveBrowseFilteredSortedStoreRows(
    ctx,
    taxonomySlice,
    storeRowsRaw ?? [],
  );
  const ids = sortedRows.map((r) => r.id);
  const dbBaseMs = devPerfNow() - dbBase0;

  const dbRelated0 = devPerfNow();
  const [productsRes, bannersRes] = await Promise.all([
    ids.length > 0 ?
      supabase
        .from("store_products")
        .select("id, store_id, title, price, thumbnail_url, is_featured, sort_order")
        .in("store_id", ids)
        .eq("product_status", "active")
        .order("is_featured", { ascending: false })
        .order("sort_order", { ascending: true })
        .limit(Math.min(ids.length * BROWSE_FEATURED_ITEMS_MAX, 360))
    : Promise.resolve({ data: [] as ProductMini[], error: null }),
    ids.length > 0 ?
      supabase
        .from("store_banners")
        .select("store_id, id, image_url, sort_order, is_active, start_at, end_at")
        .in("store_id", ids)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
    : Promise.resolve({ data: [] as BannerMini[], error: null }),
  ]);
  queryCount += ids.length > 0 ? 2 : 0;

  const { data: prods, error: pErr } = productsRes;
  if (pErr) {
    console.error("[api/stores/browse] products", pErr);
  }

  const productPreviewQueryMs = devPerfNow() - dbRelated0;

  const assembled = assembleStoresBrowseResponse(ctx, {
    taxonomySlice,
    storeRowsRaw: storeRowsRaw ?? [],
    products: (prods ?? []) as ProductMini[],
    banners: (bannersRes.data ?? []) as BannerMini[],
    taxonomyCacheHit,
    baseQueryMs,
    categoryQueryMs,
    productPreviewQueryMs,
    distanceSortMs,
    queryCount,
  });

  return {
    ok: true,
    ...assembled,
    dbBaseMs,
    taxonomyCacheHit,
    categoryQueryMs,
    baseQueryMs,
    productPreviewQueryMs,
    distanceSortMs,
    queryCount,
    selectedColumns: BROWSE_STORE_ROW_SELECTED_COLUMNS,
  };
}
