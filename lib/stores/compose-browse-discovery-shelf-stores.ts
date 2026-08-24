import type { SupabaseClient } from "@supabase/supabase-js";
import { listBrowsePrimaryIndustries } from "@/lib/stores/browse-taxonomy-seed-queries";
import {
  browseShelfAppliesToPage,
  browseShelfSortForDataType,
  composeBrowseDiscoveryShelfPayload,
  resolveBrowseShelfSourcePrimarySlugs,
  STORES_BROWSE_DISCOVERY_SHELF_PLATFORM_DEFAULT,
  type StoresBrowseDiscoveryShelfConfig,
  type StoresBrowseDiscoveryShelfPayload,
  type StoresBrowseDiscoveryShelfStoreItem,
} from "@/lib/stores/stores-browse-discovery-shelf";
import { tryLoadStoresBrowseFromSnapshot } from "@/lib/stores/stores-browse-snapshot";
import type { StoresBrowseRequestContext } from "@/lib/stores/stores-browse-build";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";
import { compareNewStoreShelfRows, isNewStoreSignal } from "@/lib/stores/store-new-store-signal";

function toShelfItem(store: BrowseStoreListItem): StoresBrowseDiscoveryShelfStoreItem {
  return {
    storeId: store.id,
    slug: store.slug,
    name: store.nameKo,
    imageUrl: store.profileImageUrl,
    etaLabel: store.etaLabel || null,
    rating: store.rating,
  };
}

export function applyNewStoreShelfMembership(stores: BrowseStoreListItem[]): BrowseStoreListItem[] {
  const qualified = stores.filter((s) => isNewStoreSignal({ firstListedAt: s.firstListedAt ?? null }));
  return [...qualified].sort((a, b) =>
    compareNewStoreShelfRows(
      { id: a.id, firstListedAt: a.firstListedAt ?? "" },
      { id: b.id, firstListedAt: b.firstListedAt ?? "" }
    )
  );
}

export async function loadBrowseDiscoveryShelfPayload(input: {
  sb: SupabaseClient;
  ctx: StoresBrowseRequestContext;
  config: StoresBrowseDiscoveryShelfConfig;
  organicStoreIds: readonly string[];
  allPrimarySlugs?: readonly string[];
}): Promise<StoresBrowseDiscoveryShelfPayload | null> {
  const { ctx, config, organicStoreIds } = input;
  if (!browseShelfAppliesToPage(config, ctx.primary)) return null;

  const allPrimarySlugs =
    input.allPrimarySlugs && input.allPrimarySlugs.length > 0
      ? input.allPrimarySlugs
      : listBrowsePrimaryIndustries().map((p) => p.slug);

  const sources = resolveBrowseShelfSourcePrimarySlugs({
    config,
    pagePrimarySlug: ctx.primary,
    allPrimarySlugs,
  });
  if (sources.length === 0) return null;

  const exclude = new Set(organicStoreIds);
  const seen = new Set<string>();
  const collected: BrowseStoreListItem[] = [];
  const sort = browseShelfSortForDataType(config.dataType);
  const fetchLimit =
    config.dataType === "new_store"
      ? 120
      : Math.min(24, Math.max(config.maxItems * 2, config.maxItems));

  for (const sourcePrimary of sources) {
    const sourceCtx: StoresBrowseRequestContext = {
      ...ctx,
      primary: sourcePrimary,
      subRaw: "all",
      wantsAllSubs: true,
      sub: "all",
      sort,
      page: 1,
      limit: fetchLimit,
      discoveryShelf: { ...STORES_BROWSE_DISCOVERY_SHELF_PLATFORM_DEFAULT, enabled: false },
    };
    const snap = await tryLoadStoresBrowseFromSnapshot(input.sb, sourceCtx, {
      bypassCounter: true,
    });
    const stores = snap && "stores" in snap.body ? snap.body.stores : [];
    for (const store of stores) {
      if (exclude.has(store.id) || seen.has(store.id)) continue;
      seen.add(store.id);
      collected.push(store);
    }
  }

  const ranked = config.dataType === "new_store" ? applyNewStoreShelfMembership(collected) : collected;
  return composeBrowseDiscoveryShelfPayload({
    config,
    pagePrimarySlug: ctx.primary,
    stores: ranked.slice(0, config.maxItems).map(toShelfItem),
  });
}
