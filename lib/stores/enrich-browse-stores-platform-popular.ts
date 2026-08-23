import type { SupabaseClient } from "@supabase/supabase-js";
import { devPerfNow } from "@/lib/dev/dev-api-perf-log";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import { resolveBrowseFeaturedMenuImageUrl } from "@/lib/stores/browse-featured-items-types";
import {
  buildActiveProductCatalogMap,
  resolveFirstPlatformPopularProduct,
  resolvePopularMenuStatsSinceIso,
} from "@/lib/stores/assemble-platform-popular-products";
import { loadCommerceSettings } from "@/lib/stores/load-commerce-settings";
import { loadStorePopularProductStatsBatch } from "@/lib/stores/load-store-popular-product-stats-batch";

export type EnrichBrowsePlatformPopularResult = {
  enrichDbMs: number;
  queryCount: number;
  popularProductStatsStatus: "ok" | "error";
};

/**
 * Post-pagination browse enrichment — page store IDs only, no ranking/sort changes.
 * On stats/catalog failure: omit optional field, never fail the browse response.
 */
export async function enrichBrowseStoresWithPlatformPopular(
  sb: SupabaseClient,
  stores: BrowseStoreListItem[]
): Promise<EnrichBrowsePlatformPopularResult> {
  const pageStoreIds = [...new Set(stores.map((s) => String(s.id).trim()).filter(Boolean))];
  if (pageStoreIds.length === 0) {
    return { enrichDbMs: 0, queryCount: 0, popularProductStatsStatus: "ok" };
  }

  const db0 = devPerfNow();
  let queryCount = 0;
  let popularProductStatsStatus: "ok" | "error" = "ok";

  try {
    const [commerce, productsRes] = await Promise.all([
      loadCommerceSettings(sb),
      sb
        .from("store_products")
        .select("id, store_id, title, price, thumbnail_url")
        .in("store_id", pageStoreIds)
        .eq("product_status", "active"),
    ]);
    queryCount += 2;

    if (productsRes.error) {
      console.error("[enrichBrowseStoresWithPlatformPopular] products", productsRes.error.message);
      return {
        enrichDbMs: devPerfNow() - db0,
        queryCount,
        popularProductStatsStatus: "ok",
      };
    }

    const activeCatalogByStore = buildActiveProductCatalogMap(
      (productsRes.data ?? []) as Array<{
        id: string;
        store_id: string;
        title: string;
        price: number;
        thumbnail_url: string | null;
      }>,
      resolveBrowseFeaturedMenuImageUrl
    );

    const since = resolvePopularMenuStatsSinceIso(commerce.popularMenuWindowDays);
    const statsLoad = await loadStorePopularProductStatsBatch(sb, pageStoreIds, {
      since,
      limitPerStore: commerce.popularMenuTopN,
    });
    queryCount += 1;

    popularProductStatsStatus = statsLoad.status;
    if (statsLoad.status === "error") {
      console.error("[enrichBrowseStoresWithPlatformPopular] popular product stats batch failed");
    }

    for (const store of stores) {
      const catalog = activeCatalogByStore.get(store.id);
      const statRows = statsLoad.status === "ok" ? (statsLoad.byStoreId.get(store.id) ?? []) : [];
      const product = resolveFirstPlatformPopularProduct(
        statRows,
        catalog,
        commerce.popularMenuMinQty,
        commerce.popularMenuWindowDays
      );
      if (product) {
        store.platformPopularProduct = product;
      }
    }
  } catch (e) {
    console.error(
      "[enrichBrowseStoresWithPlatformPopular]",
      e instanceof Error ? e.message : String(e)
    );
  }

  return {
    enrichDbMs: devPerfNow() - db0,
    queryCount,
    popularProductStatsStatus,
  };
}
