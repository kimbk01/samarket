import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrowseTaxonomySlice } from "@/lib/stores/stores-browse-taxonomy-cache";
import {
  buildBrowseStoresOrFilter,
  BROWSE_STORE_ROW_SELECTED_COLUMNS,
  mapBrowseEmbedRows,
  resolveBrowseFilteredStoreRows,
  type StoreBrowseRow,
  type StoresBrowseRequestContext,
} from "@/lib/stores/stores-browse-build";

/**
 * Post-rank response cap for HOME feed payload (not a pre-rank candidate gate).
 */
export const STORE_HOME_FEED_RESPONSE_MAX = 48;

/**
 * Paginated candidate fetch batch — avoids PostgREST default row cap (typically 1000).
 */
export const STORE_DISCOVERY_CANDIDATE_PAGE_SIZE = 500;

export type StoreDiscoveryCandidateLoadStatus = "ok" | "error";

export type StoreDiscoveryCandidateLoadResult<T> = {
  status: StoreDiscoveryCandidateLoadStatus;
  rows: T[];
  pagesFetched: number;
};

type RelOne = { slug: string; name: string };

function embedOne(v: RelOne | RelOne[] | null | undefined): RelOne | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type PageFetchResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Index-stable pagination until a short page — full candidate scope for ranking.
 */
export async function fetchDiscoveryCandidatePages<T>(
  fetchPage: (rangeFrom: number, rangeTo: number) => Promise<PageFetchResult<T>>
): Promise<StoreDiscoveryCandidateLoadResult<T>> {
  const rows: T[] = [];
  let pagesFetched = 0;
  let from = 0;

  while (true) {
    const to = from + STORE_DISCOVERY_CANDIDATE_PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    pagesFetched += 1;
    if (error) {
      return { status: "error", rows, pagesFetched };
    }
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < STORE_DISCOVERY_CANDIDATE_PAGE_SIZE) {
      return { status: "ok", rows, pagesFetched };
    }
    from += STORE_DISCOVERY_CANDIDATE_PAGE_SIZE;
  }
}

/**
 * Ranking authority is ONLY the direct candidate path — snapshot capped rows are never used.
 */
export function resolveStoreDiscoveryRankingCandidateRows<T>(
  directResult: StoreDiscoveryCandidateLoadResult<T>
): T[] {
  if (directResult.status === "error") return [];
  return directResult.rows;
}

/**
 * Browse ranking candidate selector — snapshot store rows are product/banner cache only.
 */
export function selectBrowseStoreRowsForRanking(
  directResult: StoreDiscoveryCandidateLoadResult<StoreBrowseRow>,
  snapshotStoreRowsRaw: unknown[]
): StoreBrowseRow[] {
  void snapshotStoreRowsRaw;
  return resolveStoreDiscoveryRankingCandidateRows(directResult);
}

/**
 * Taxonomy-scoped browse candidates — paginated, no created_at pre-limit (CUT 1).
 */
export async function loadBrowseDiscoveryCandidateRows(
  sb: SupabaseClient,
  ctx: Pick<StoresBrowseRequestContext, "primary" | "subRaw" | "wantsAllSubs">,
  taxonomySlice: BrowseTaxonomySlice
): Promise<StoreDiscoveryCandidateLoadResult<StoreBrowseRow>> {
  const categoryId = String(taxonomySlice.categoryId ?? "").trim();
  if (!categoryId) return { status: "ok", rows: [], pagesFetched: 0 };

  const orphanOrParts = taxonomySlice.primaryAliases
    .map((a) => `business_type.ilike.%${a.replace(/%/g, "")}%`)
    .filter(Boolean);

  const orFilter = buildBrowseStoresOrFilter(
    categoryId,
    taxonomySlice.resolvedTopicId,
    ctx.wantsAllSubs,
    orphanOrParts
  );

  const selectColumns = `${BROWSE_STORE_ROW_SELECTED_COLUMNS}, store_topics ( slug, name )`;

  const paged = await fetchDiscoveryCandidatePages<StoreBrowseRow>(async (from, to) => {
    const { data, error } = await sb
      .from("stores")
      .select(selectColumns)
      .eq("approval_status", "approved")
      .eq("is_visible", true)
      .or(orFilter)
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      console.error("[loadBrowseDiscoveryCandidateRows]", error.message);
      return { data: null, error: { message: error.message } };
    }

    const mapped = mapBrowseEmbedRows((data ?? []) as unknown[]);
    return { data: mapped, error: null };
  });

  if (paged.status === "error") return paged;

  return {
    status: "ok",
    rows: resolveBrowseFilteredStoreRows(ctx, taxonomySlice, paged.rows),
    pagesFetched: paged.pagesFetched,
  };
}

const HOME_DISCOVERY_SELECT = `
  id,
  owner_user_id,
  store_name,
  slug,
  region,
  city,
  district,
  place_id,
  formatted_address,
  detail_address,
  address_line1,
  address_line2,
  lat,
  lng,
  profile_image_url,
  description,
  is_open,
  point_commerce_blocked,
  business_hours_json,
  created_at,
  rating_avg,
  review_count,
  delivery_available,
  pickup_available,
  visit_available,
  is_featured,
  store_categories ( slug, name )
`;

/**
 * Region-scoped HOME discovery candidates — paginated approved+visible, no pre-rank cap.
 */
export async function loadHomeDiscoveryCandidateRows(
  sb: SupabaseClient,
  opts?: { searchQ?: string | null }
): Promise<StoreDiscoveryCandidateLoadResult<Record<string, unknown>>> {
  const searchQ = opts?.searchQ?.trim();

  const paged = await fetchDiscoveryCandidatePages<Record<string, unknown>>(async (from, to) => {
    let q = sb
      .from("stores")
      .select(HOME_DISCOVERY_SELECT)
      .eq("approval_status", "approved")
      .eq("is_visible", true);

    if (searchQ && searchQ.length >= 2) {
      const pat = `%${searchQ}%`;
      q = q.or(`store_name.ilike."${pat}",slug.ilike."${pat}"`);
    }

    const { data, error } = await q.order("id", { ascending: true }).range(from, to);

    if (error) {
      console.error("[loadHomeDiscoveryCandidateRows]", error.message);
      return { data: null, error: { message: error.message } };
    }

    const mapped = (data ?? []).map((r) => {
      const o = r as Record<string, unknown> & { store_categories?: RelOne | RelOne[] };
      return {
        ...o,
        store_categories: embedOne(o.store_categories),
      };
    });
    return { data: mapped, error: null };
  });

  return paged;
}
