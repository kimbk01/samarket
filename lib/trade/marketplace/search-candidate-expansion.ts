/**
 * CUT C — SEARCH candidate expansion + tier assembly.
 *
 * Candidate gate is NOT title ILIKE %q% alone.
 * T1 phrase → T2 strong related → T3 same-location looser → T4 global looser.
 * Location is a tier axis, not a hard dump of every local listing.
 *
 * DO NOT: new search table; vector/fuzzy; DETAIL similar-posts; client page filter;
 * 0..1999 rescan; treat a short window as search exhaustion.
 */
import { sanitizeMarketplaceQueryText } from "@/lib/trade/marketplace/query-contract";
import { getTradeOptionCatalog } from "@/lib/trade/category-form/option-catalogs";
import {
  resolveListingLguCanonicalId,
  sortListingsByLguDistance,
} from "@/lib/trade/marketplace/sort-listings-by-lgu-distance";

export type SearchExpansionUserSort = "latest" | "popular" | "distance";

export const SEARCH_EXPANSION_EXACT_BATCH = 40;
export const SEARCH_EXPANSION_RELATED_IN_BATCH = 50;
export const SEARCH_EXPANSION_RELATED_OUT_BATCH = 30;
export const SEARCH_EXPANSION_MAX_QUERIES_PER_ROUND = 3;

export type SearchExpansionListing = {
  id?: string;
  title?: string | null;
  meta?: Record<string, unknown> | null;
  trade_lgu_id?: string | null;
  region?: string | null;
  city?: string | null;
  created_at?: string;
};

export type SearchExpansionHints = {
  phrase: string;
  tokens: string[];
  makes: string[];
  models: string[];
  bodyTypes: string[];
};

export type SearchExpansionTier = 1 | 2 | 3 | 4 | 5;

export type SearchExpansionCursor = {
  exactOffset: number;
  relatedInOffset: number;
  relatedOutOffset: number;
  tailOffset: number;
  exactExhausted: boolean;
  relatedInExhausted: boolean;
  relatedOutExhausted: boolean;
  tailExhausted: boolean;
  seenIds: string[];
  inferredBodyTypes: string[];
};

export const SEARCH_EXPANSION_TAIL_BATCH = 50;

export function emptySearchExpansionCursor(): SearchExpansionCursor {
  return {
    exactOffset: 0,
    relatedInOffset: 0,
    relatedOutOffset: 0,
    tailOffset: 0,
    exactExhausted: false,
    relatedInExhausted: false,
    relatedOutExhausted: false,
    tailExhausted: false,
    seenIds: [],
    inferredBodyTypes: [],
  };
}

export function shouldApplyMarketplaceSearchExpansion(input: {
  q?: string | null;
  sort?: string | null;
}): boolean {
  void input.sort;
  return Boolean(sanitizeMarketplaceQueryText(input.q));
}

export function normalizeSearchExpansionText(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function escapeIlikeNeedle(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function listingMetaText(meta: Record<string, unknown> | null | undefined, key: string): string {
  if (!meta || typeof meta !== "object") return "";
  const value = meta[key];
  return typeof value === "string" ? normalizeSearchExpansionText(value) : "";
}

function catalogNeedles(catalogId: string): { value: string; labels: string[] }[] {
  return getTradeOptionCatalog(catalogId).map((entry) => ({
    value: normalizeSearchExpansionText(entry.value),
    labels: [
      normalizeSearchExpansionText(entry.value),
      normalizeSearchExpansionText(entry.labelEn),
      normalizeSearchExpansionText(entry.labelKo),
    ].filter((s) => s.length > 0 && s !== "__other_model__" && s !== "other" && s !== "기타"),
  }));
}

function tokenHitsCatalog(
  token: string,
  rows: { value: string; labels: string[] }[]
): string | null {
  if (token.length < 2) return null;
  for (const row of rows) {
    if (row.labels.some((label) => label === token || (token.length >= 3 && label.includes(token)))) {
      return row.value;
    }
  }
  return null;
}

export function resolveSearchExpansionHints(q: string | null | undefined): SearchExpansionHints | null {
  const phraseRaw = sanitizeMarketplaceQueryText(q);
  if (!phraseRaw) return null;
  const phrase = normalizeSearchExpansionText(phraseRaw);
  const tokens = phrase.split(" ").filter((token) => token.length > 0);
  const makes: string[] = [];
  const models: string[] = [];
  const bodyTypes: string[] = [];
  const brandRows = catalogNeedles("used_car_brands");
  const modelRows = catalogNeedles("used_car_models");
  const bodyRows = catalogNeedles("used_car_body_types");
  for (const token of tokens) {
    const make = tokenHitsCatalog(token, brandRows);
    if (make && !makes.includes(make)) makes.push(make);
    const model = tokenHitsCatalog(token, modelRows);
    if (model && !models.includes(model)) models.push(model);
    const body = tokenHitsCatalog(token, bodyRows);
    if (body && !bodyTypes.includes(body)) bodyTypes.push(body);
  }
  return { phrase, tokens, makes, models, bodyTypes };
}

export function buildSearchExpansionRelatedOrFilter(
  hints: SearchExpansionHints,
  inferredBodyTypes: string[] = []
): string | null {
  const parts: string[] = [];
  const seen = new Set<string>();
  const push = (part: string) => {
    if (!part || seen.has(part) || parts.length >= 16) return;
    seen.add(part);
    parts.push(part);
  };
  for (const token of hints.tokens) {
    if (token.length < 3) continue;
    const needle = escapeIlikeNeedle(token);
    push(`title.ilike.%${needle}%`);
    push(`meta->>car_model.ilike.%${needle}%`);
  }
  for (const make of hints.makes) {
    push(`meta->>car_model.ilike.%${escapeIlikeNeedle(make)}%`);
  }
  for (const model of hints.models) {
    push(`meta->>car_model.ilike.%${escapeIlikeNeedle(model)}%`);
  }
  const bodies = [...new Set([...hints.bodyTypes, ...inferredBodyTypes])];
  for (const body of bodies) {
    push(`meta->>car_body_type.eq.${body}`);
  }
  return parts.length > 0 ? parts.join(",") : null;
}

export function inferBodyTypesFromListings<T extends SearchExpansionListing>(rows: T[]): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const body = listingMetaText(row.meta ?? null, "car_body_type");
    if (body && !out.includes(body)) out.push(body);
  }
  return out;
}

function createdAtMs(raw: string | undefined): number {
  return Date.parse(raw ?? "") || 0;
}

function titleBand(title: string, phrase: string): number {
  if (!phrase) return 4;
  if (title === phrase) return 0;
  if (title.startsWith(phrase)) return 1;
  if (title.includes(phrase)) return 2;
  return 4;
}

function listingInBrowseLgu(
  listing: SearchExpansionListing,
  browseLguCanonicalId: string | null | undefined
): boolean {
  const browse = browseLguCanonicalId?.trim() ?? "";
  if (!browse) return true;
  return resolveListingLguCanonicalId(listing) === browse;
}

function strongRelated(listing: SearchExpansionListing, hints: SearchExpansionHints): boolean {
  const title = normalizeSearchExpansionText(listing.title ?? "");
  const carModel = listingMetaText(listing.meta ?? null, "car_model");
  const haystack = `${title} ${carModel}`.trim();
  if (hints.models.some((model) => haystack.includes(model))) return true;
  if (hints.makes.some((make) => haystack.includes(make))) return true;
  if (hints.tokens.length > 0 && hints.tokens.filter((t) => t.length >= 3).every((token) => haystack.includes(token))) {
    return true;
  }
  if (hints.tokens.some((token) => token.length >= 3 && haystack.includes(token))) return true;
  return false;
}

function looserRelated(
  listing: SearchExpansionListing,
  hints: SearchExpansionHints,
  inferredBodyTypes: string[]
): boolean {
  const body = listingMetaText(listing.meta ?? null, "car_body_type");
  const allowed = new Set([...hints.bodyTypes, ...inferredBodyTypes]);
  return Boolean(body && allowed.has(body));
}

export function classifySearchExpansionTier(
  listing: SearchExpansionListing,
  hints: SearchExpansionHints,
  browseLguCanonicalId: string | null | undefined,
  inferredBodyTypes: string[] = []
): SearchExpansionTier | null {
  const title = normalizeSearchExpansionText(listing.title ?? "");
  if (hints.phrase && title.includes(hints.phrase)) return 1;
  if (strongRelated(listing, hints)) return 2;
  if (!looserRelated(listing, hints, inferredBodyTypes)) return null;
  if (listingInBrowseLgu(listing, browseLguCanonicalId)) return 3;
  if (browseLguCanonicalId?.trim()) return 4;
  return 3;
}

function sortTierRows<T extends SearchExpansionListing & { view_count?: number | null }>(
  rows: T[],
  hints: SearchExpansionHints,
  tier: SearchExpansionTier,
  userSort: SearchExpansionUserSort = "latest",
  anchorCanonicalId?: string | null
): T[] {
  if (userSort === "distance" && anchorCanonicalId?.trim()) {
    return sortListingsByLguDistance(rows, anchorCanonicalId.trim()) as T[];
  }
  return [...rows].sort((a, b) => {
    if (userSort === "popular") {
      const av = Number(a.view_count ?? 0);
      const bv = Number(b.view_count ?? 0);
      if (bv !== av) return bv - av;
    }
    if (tier === 1) {
      const ba = titleBand(normalizeSearchExpansionText(a.title ?? ""), hints.phrase);
      const bb = titleBand(normalizeSearchExpansionText(b.title ?? ""), hints.phrase);
      if (ba !== bb) return ba - bb;
    }
    return createdAtMs(b.created_at) - createdAtMs(a.created_at);
  });
}

function sortTierRowsWithWithinOutsidePriority<T extends SearchExpansionListing & { view_count?: number | null }>(
  rows: T[],
  hints: SearchExpansionHints,
  tier: SearchExpansionTier,
  browseLguCanonicalId: string | null | undefined,
  userSort: SearchExpansionUserSort = "latest"
): T[] {
  if (!browseLguCanonicalId?.trim()) return sortTierRows(rows, hints, tier, userSort);
  const within: T[] = [];
  const outside: T[] = [];
  for (const r of rows) {
    if (listingInBrowseLgu(r, browseLguCanonicalId)) within.push(r);
    else outside.push(r);
  }
  return [
    ...sortTierRows(within, hints, tier, userSort, browseLguCanonicalId),
    ...sortTierRows(outside, hints, tier, userSort, browseLguCanonicalId),
  ];
}

export function assembleSearchExpansionRound<T extends SearchExpansionListing & { id?: string; view_count?: number | null }>(input: {
  exactRows: T[];
  relatedInRows: T[];
  relatedOutRows: T[];
  tailRows?: T[];
  hints: SearchExpansionHints;
  browseLguCanonicalId?: string | null;
  userSort?: SearchExpansionUserSort;
  cursor: SearchExpansionCursor;
}): { posts: T[]; cursor: SearchExpansionCursor } {
  const userSort = input.userSort ?? "latest";
  const seen = new Set(input.cursor.seenIds);
  const inferred = [...new Set([...input.cursor.inferredBodyTypes, ...inferBodyTypesFromListings(input.exactRows)])];
  const buckets: Record<SearchExpansionTier, T[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  const consider = [...input.exactRows, ...input.relatedInRows, ...input.relatedOutRows];
  for (const row of consider) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id || seen.has(id)) continue;
    const extraInferred = [...inferred, ...inferBodyTypesFromListings([row])];
    const tier = classifySearchExpansionTier(
      row,
      input.hints,
      input.browseLguCanonicalId,
      extraInferred
    );
    if (!tier) continue;
    seen.add(id);
    buckets[tier].push(row);
  }
  for (const row of input.tailRows ?? []) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    buckets[5].push(row);
  }
  const posts = (
    [
      ...sortTierRowsWithWithinOutsidePriority(buckets[1], input.hints, 1, input.browseLguCanonicalId, userSort),
      ...sortTierRowsWithWithinOutsidePriority(buckets[2], input.hints, 2, input.browseLguCanonicalId, userSort),
      ...sortTierRowsWithWithinOutsidePriority(buckets[3], input.hints, 3, input.browseLguCanonicalId, userSort),
      ...sortTierRowsWithWithinOutsidePriority(buckets[4], input.hints, 4, input.browseLguCanonicalId, userSort),
      ...sortTierRowsWithWithinOutsidePriority(buckets[5], input.hints, 5, input.browseLguCanonicalId, userSort),
    ] as T[]
  );
  return {
    posts,
    cursor: {
      ...input.cursor,
      seenIds: [...seen],
      inferredBodyTypes: [...new Set([...inferred, ...inferBodyTypesFromListings(posts)])],
    },
  };
}

export function searchExpansionSourcesExhausted(cursor: SearchExpansionCursor): boolean {
  return (
    cursor.exactExhausted &&
    cursor.relatedInExhausted &&
    cursor.relatedOutExhausted &&
    cursor.tailExhausted
  );
}

export function advanceSearchExpansionCursor(
  cursor: SearchExpansionCursor,
  fetched: { exact: number; relatedIn: number; relatedOut: number },
  caps: { exact: number; relatedIn: number; relatedOut: number },
  fetchedThisRound: { exact: boolean; relatedIn: boolean; relatedOut: boolean } = {
    exact: true,
    relatedIn: true,
    relatedOut: true,
  }
): SearchExpansionCursor {
  return {
    ...cursor,
    exactOffset: fetchedThisRound.exact ? cursor.exactOffset + fetched.exact : cursor.exactOffset,
    relatedInOffset: fetchedThisRound.relatedIn
      ? cursor.relatedInOffset + fetched.relatedIn
      : cursor.relatedInOffset,
    relatedOutOffset: fetchedThisRound.relatedOut
      ? cursor.relatedOutOffset + fetched.relatedOut
      : cursor.relatedOutOffset,
    exactExhausted:
      cursor.exactExhausted || (fetchedThisRound.exact && fetched.exact < caps.exact),
    relatedInExhausted:
      cursor.relatedInExhausted || (fetchedThisRound.relatedIn && fetched.relatedIn < caps.relatedIn),
    relatedOutExhausted:
      cursor.relatedOutExhausted ||
      (fetchedThisRound.relatedOut && fetched.relatedOut < caps.relatedOut),
  };
}
