/**
 * Marketplace browse committed state — URL is authority.
 * Parse / serialize / filter-draft merge without delete-then-restore URL params.
 */
import {
  appendCompositionFilterSearchParams,
  parseCompositionFilterSearchParams,
  sanitizeCompositionFilterSelection,
  resolveCompositionAttributeFilterFields,
  resolveTradeCompositionForCategory,
  type CompositionFilterSelection,
} from "@/lib/trade/category-form";
import type { CategoryWithSettings } from "@/lib/categories/types";
import {
  applyTradeLocationScopeToSearchParams,
  buildTradeCityScopeFromCanonical,
  parseTradeLocationScopeFromSearchParams,
  tradeLocationScopeCacheSegment,
  type TradeLocationScope,
} from "@/lib/trade/location/trade-location-scope";
import {
  sanitizeTradeBrowseRadiusKm,
  TRADE_LOCATION_RADIUS_PARAM,
} from "@/lib/trade/location/trade-browse-radius";
import {
  parseMarketplacePriceBound,
  sanitizeMarketplaceQueryText,
} from "@/lib/trade/marketplace/query-contract";

export type MarketplaceBrowseSort = "latest" | "near" | "popular";
export type MarketplaceBrowseTradeState = "all" | "active" | "sold";

export type MarketplaceBrowseState = {
  q: string | null;
  sort: MarketplaceBrowseSort;
  tradeState: MarketplaceBrowseTradeState;
  priceMin: number | null;
  priceMax: number | null;
  rootCategoryId: string | null;
  rootCategoryIds: string[];
  topicKey: string | null;
  topicByRoot: Record<string, string | null>;
  compositionFilters: CompositionFilterSelection;
  locationScope: TradeLocationScope;
};

export type MarketFilterDraftLocation = {
  regionMode: "commit" | "other" | "all";
  distanceAll: boolean;
  radiusKm: number;
  otherCityCanonicalId: string | null;
};

export type MarketFilterDraftInput = {
  sort: MarketplaceBrowseSort;
  tradeState: MarketplaceBrowseTradeState;
  priceMin: string;
  priceMax: string;
  rootCategoryId: string | null;
  rootCategoryIds: string[];
  topicKey: string | null;
  topicByRoot: Record<string, string | null>;
  filters: CompositionFilterSelection;
  location: MarketFilterDraftLocation;
};

function parseSortFromSearch(sp: URLSearchParams): MarketplaceBrowseSort {
  const s = (sp.get("sort") ?? sp.get("fs") ?? "").trim().toLowerCase();
  if (s === "near" || s === "distance") return "near";
  if (s === "popular") return "popular";
  return "latest";
}

function parseTradeStateFromSearch(sp: URLSearchParams): MarketplaceBrowseTradeState {
  const s = (sp.get("tradeState") ?? "").trim().toLowerCase();
  if (s === "active") return "active";
  if (s === "sold") return "sold";
  return "all";
}

function parseRootIdsFromSearch(sp: URLSearchParams): string[] {
  const raw = sp.get("categoryIds");
  const fromIds =
    raw && raw.trim()
      ? raw
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : [];
  if (fromIds.length > 0) return fromIds;
  const fallback = sp.get("category");
  if (fallback && fallback.trim()) return [fallback.trim()];
  return [];
}

function parseTopicByRootFromSearch(
  sp: URLSearchParams,
  selectedRootIds: string[]
): Record<string, string | null> {
  const primaryRootId = selectedRootIds[0] ?? null;
  const topicParam = sp.get("topic")?.trim() ?? "";
  const out: Record<string, string | null> = {};

  const pairsRaw = sp.getAll("topicByRoot").join(",");
  if (pairsRaw.trim()) {
    for (const part of pairsRaw.split(",")) {
      const p = part.trim();
      if (!p) continue;
      const idx = p.indexOf(":");
      if (idx <= 0) continue;
      const rootId = p.slice(0, idx).trim();
      const topicKey = p.slice(idx + 1).trim();
      if (!rootId) continue;
      if (selectedRootIds.length > 0 && !selectedRootIds.includes(rootId)) continue;
      out[rootId] = topicKey ? topicKey : null;
    }
  }

  if (primaryRootId && topicParam && out[primaryRootId] == null) {
    out[primaryRootId] = topicParam;
  }

  return out;
}

/** Parse committed browse state from URL search params. */
export function parseMarketplaceBrowseStateFromSearchParams(
  sp: URLSearchParams
): MarketplaceBrowseState {
  const rootCategoryIds = parseRootIdsFromSearch(sp);
  const primaryRootId = rootCategoryIds[0] ?? sp.get("category")?.trim() ?? null;
  const topicByRoot = parseTopicByRootFromSearch(sp, rootCategoryIds);
  const topicKey =
    primaryRootId && topicByRoot[primaryRootId] != null
      ? topicByRoot[primaryRootId]
      : sp.get("topic")?.trim() || null;

  return {
    q: sanitizeMarketplaceQueryText(sp.get("q")) ?? null,
    sort: parseSortFromSearch(sp),
    tradeState: parseTradeStateFromSearch(sp),
    priceMin: parseMarketplacePriceBound(sp.get("priceMin")) ?? null,
    priceMax: parseMarketplacePriceBound(sp.get("priceMax")) ?? null,
    rootCategoryId: primaryRootId,
    rootCategoryIds,
    topicKey,
    topicByRoot,
    compositionFilters: parseCompositionFilterSearchParams(sp),
    locationScope: parseTradeLocationScopeFromSearchParams(sp),
  };
}

/** Stable identity segment for browse-key transition (cache / list replace). */
export function marketplaceBrowseStateIdentityKey(state: MarketplaceBrowseState): string {
  const marketKey = (() => {
    const ids = state.rootCategoryIds;
    if (!ids.length) return state.rootCategoryId ?? "all";
    const rootsKey = [...new Set(ids)].sort().join(",");
    const pairs: string[] = [];
    for (const [rid, t] of Object.entries(state.topicByRoot)) {
      const rootId = rid?.trim();
      const topicKey = t?.trim();
      if (!rootId || !topicKey) continue;
      if (!ids.includes(rootId)) continue;
      pairs.push(`${rootId}:${topicKey}`);
    }
    pairs.sort();
    const topicsKey = pairs.length > 0 ? `:t:${pairs.join(",")}` : "";
    return `roots:${rootsKey}${topicsKey}`;
  })();

  const q = state.q ?? "";
  const ts =
    state.tradeState === "active" ? "active" : state.tradeState === "sold" ? "sold" : "latest";
  const sort = state.sort;
  const loc = tradeLocationScopeCacheSegment(state.locationScope);
  const pmin = state.priceMin ?? "";
  const pmax = state.priceMax ?? "";
  const cfKeys = Object.keys(state.compositionFilters).sort();
  const cf =
    cfKeys.length > 0
      ? `:cf:${cfKeys.map((k) => `${k}=${state.compositionFilters[k] ?? ""}`).join(",")}`
      : "";

  return `m:${marketKey}:ts:${ts}:sort:${sort}:${loc}:q:${q}:p:${pmin}-${pmax}${cf}`;
}

export function marketplaceBrowseStateIdentityEquals(a: MarketplaceBrowseState, b: MarketplaceBrowseState): boolean {
  return marketplaceBrowseStateIdentityKey(a) === marketplaceBrowseStateIdentityKey(b);
}

function clearCategoryAndFilterParams(sp: URLSearchParams, knownFieldIds: readonly string[]): void {
  sp.delete("category");
  sp.delete("categoryIds");
  sp.delete("topic");
  sp.delete("topicByRoot");
  for (const fid of knownFieldIds) sp.delete(`filters[${fid}]`);
}

function resolveFilterDraftLocationScope(
  committed: MarketplaceBrowseState,
  draft: MarketFilterDraftInput
): TradeLocationScope {
  if (draft.location.regionMode === "all") {
    return { mode: "all" };
  }

  if (draft.location.regionMode === "other" && draft.location.otherCityCanonicalId) {
    const radiusKm = draft.location.distanceAll
      ? null
      : sanitizeTradeBrowseRadiusKm(draft.location.radiusKm);
    const scope = buildTradeCityScopeFromCanonical(draft.location.otherCityCanonicalId, radiusKm);
    if (scope) return scope;
  }

  if (committed.locationScope.mode === "city") {
    const radiusKm = draft.location.distanceAll
      ? null
      : sanitizeTradeBrowseRadiusKm(draft.location.radiusKm);
    return {
      ...committed.locationScope,
      radiusKm,
    };
  }

  if (committed.locationScope.mode === "all") {
    return { mode: "all" };
  }

  /** UNSET / INVALID — preserve committed location axis; never silently drop or invent ALL. */
  return committed.locationScope;
}

/** Serialize committed + filter draft → next URL search string (pathname caller supplies). */
export function serializeMarketFilterDraftToSearchParams(opts: {
  committedSearch: string;
  draft: MarketFilterDraftInput;
  rootCategory: CategoryWithSettings | null;
  knownCompositionFieldIds: readonly string[];
}): URLSearchParams {
  const committed = parseMarketplaceBrowseStateFromSearchParams(
    new URLSearchParams(opts.committedSearch)
  );
  const sp = new URLSearchParams(opts.committedSearch);

  sp.delete("page");
  sp.delete("cursor");

  clearCategoryAndFilterParams(sp, opts.knownCompositionFieldIds);

  sp.delete("sort");
  sp.delete("fs");
  sp.delete("priceMin");
  sp.delete("priceMax");
  sp.delete("tradeState");

  if (committed.q) sp.set("q", committed.q);
  else sp.delete("q");

  if (opts.draft.sort === "near") sp.set("sort", "near");
  else if (opts.draft.sort === "popular") sp.set("sort", "popular");

  const minNum = Number(opts.draft.priceMin);
  const maxNum = Number(opts.draft.priceMax);
  if (opts.draft.priceMin && !Number.isNaN(minNum) && minNum > 0) {
    sp.set("priceMin", String(Math.floor(minNum)));
  }
  if (opts.draft.priceMax && !Number.isNaN(maxNum) && maxNum > 0) {
    sp.set("priceMax", String(Math.floor(maxNum)));
  }

  if (opts.draft.tradeState === "active") sp.set("tradeState", "active");
  else if (opts.draft.tradeState === "sold") sp.set("tradeState", "sold");

  const nextLocation = resolveFilterDraftLocationScope(committed, opts.draft);
  const withLocation = applyTradeLocationScopeToSearchParams(sp, nextLocation);

  if (!opts.draft.rootCategoryId || opts.draft.rootCategoryIds.length === 0) {
    return withLocation;
  }

  const primaryRootId = opts.draft.rootCategoryId;
  const nextRootIds = [...new Set(opts.draft.rootCategoryIds)].filter(Boolean);

  withLocation.set("category", primaryRootId);
  withLocation.set("categoryIds", nextRootIds.join(","));

  withLocation.delete("topicByRoot");
  if (opts.draft.topicKey) withLocation.set("topic", opts.draft.topicKey);
  else withLocation.delete("topic");

  for (const rid of nextRootIds) {
    const t = opts.draft.topicByRoot?.[rid] ?? null;
    if (!t) continue;
    withLocation.append("topicByRoot", `${rid}:${t}`);
  }

  if (opts.rootCategory) {
    const composition = resolveTradeCompositionForCategory(opts.rootCategory);
    const sanitizedFilters = sanitizeCompositionFilterSelection(opts.draft.filters, composition);
    appendCompositionFilterSearchParams(withLocation, sanitizedFilters);
  }

  return withLocation;
}

export function buildMarketFilterDraftHref(opts: {
  committedSearch: string;
  draft: MarketFilterDraftInput;
  rootCategory: CategoryWithSettings | null;
  knownCompositionFieldIds: readonly string[];
  pathname?: string;
}): string {
  const sp = serializeMarketFilterDraftToSearchParams(opts);
  const qs = sp.toString();
  const path = opts.pathname ?? "/market";
  return qs ? `${path}?${qs}` : path;
}

/**
 * Filter-sheet reset — sort/price/tradeState/composition only.
 * Preserves q, location, and category (filter-only, not CLASS A full browse reset).
 */
export function buildMarketFilterOnlyResetHref(opts: {
  baseSearch: string;
  knownCompositionFieldIds: readonly string[];
  pathname?: string;
}): string {
  const sp = new URLSearchParams(opts.baseSearch);

  for (const k of ["tradeState", "sort", "fs", "priceMin", "priceMax", "page", "cursor"]) {
    sp.delete(k);
  }
  for (const fid of opts.knownCompositionFieldIds) sp.delete(`filters[${fid}]`);

  const qs = sp.toString();
  const path = opts.pathname ?? "/market";
  return qs ? `${path}?${qs}` : path;
}