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
import {
  peekStoresBrowseShelfSourceCache,
  setStoresBrowseShelfSourceCache,
} from "@/lib/stores/stores-browse-response-cache";
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

/**
 * 탐색 선반 소스 1차들의 매장 목록 (소스 순서 · 중복 제거 · 페이지 자연 목록 제외 전).
 * 5-C BR-02 — 저장 스냅샷 경로(`bypassCounter` 없음)·소스 병렬·선반 전용 조회(삽입 메타·인기 메뉴 보강 생략).
 * 운영자가 끈 소스 1차(`isSourcePrimaryEnabled` false)는 조회하지 않는다 — 기존 삽입 메타 게이트(꺼진 업종 → 빈 목록)와 같은 결과.
 */
async function loadBrowseDiscoveryShelfSourceStores(input: {
  sb: SupabaseClient;
  ctx: StoresBrowseRequestContext;
  sources: readonly string[];
  sort: StoresBrowseRequestContext["sort"];
  fetchLimit: number;
  isSourcePrimaryEnabled?: (primarySlug: string) => boolean;
}): Promise<BrowseStoreListItem[]> {
  const { ctx, sort, fetchLimit } = input;
  const enabledSources = input.sources.filter((p) => input.isSourcePrimaryEnabled?.(p) ?? true);
  const perSource = await Promise.all(
    enabledSources.map(async (sourcePrimary) => {
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
        purpose: "discovery_shelf",
      });
      return snap && "stores" in snap.body ? snap.body.stores : [];
    })
  );
  const seen = new Set<string>();
  const collected: BrowseStoreListItem[] = [];
  for (const stores of perSource) {
    for (const store of stores) {
      if (seen.has(store.id)) continue;
      seen.add(store.id);
      collected.push(store);
    }
  }
  return collected;
}

export async function loadBrowseDiscoveryShelfPayload(input: {
  sb: SupabaseClient;
  ctx: StoresBrowseRequestContext;
  config: StoresBrowseDiscoveryShelfConfig;
  organicStoreIds: readonly string[];
  allPrimarySlugs?: readonly string[];
  /** 5-C BR-02 — `browseShelfSourceCacheKey` (없으면 캐시 미사용) */
  cacheKey?: string | null;
  isSourcePrimaryEnabled?: (primarySlug: string) => boolean;
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

  const sort = browseShelfSortForDataType(config.dataType);
  const fetchLimit =
    config.dataType === "new_store"
      ? 120
      : Math.min(24, Math.max(config.maxItems * 2, config.maxItems));

  const cacheKey = input.cacheKey?.trim() || null;
  let sourceStores = cacheKey ? peekStoresBrowseShelfSourceCache<BrowseStoreListItem>(cacheKey) : null;
  if (!sourceStores) {
    sourceStores = await loadBrowseDiscoveryShelfSourceStores({
      sb: input.sb,
      ctx,
      sources,
      sort,
      fetchLimit,
      isSourcePrimaryEnabled: input.isSourcePrimaryEnabled,
    });
    if (cacheKey) setStoresBrowseShelfSourceCache(cacheKey, sourceStores);
  }

  const exclude = new Set(organicStoreIds);
  const collected = sourceStores.filter((s) => !exclude.has(s.id));
  const ranked = config.dataType === "new_store" ? applyNewStoreShelfMembership(collected) : collected;
  return composeBrowseDiscoveryShelfPayload({
    config,
    pagePrimarySlug: ctx.primary,
    stores: ranked.slice(0, config.maxItems).map(toShelfItem),
  });
}
