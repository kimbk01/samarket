/**
 * `GET /api/stores/[slug]/menus` 서버 구간 breakdown — dev 기본, prod는 DIBAY_MENUS_API_BREAKDOWN=1
 */

export type DeliveryMenusApiBreakdown = {
  event: "menus_api_breakdown";
  slug: string;
  total_ms: number;
  auth_ms: number;
  store_lookup_ms: number;
  categories_fetch_ms: number;
  products_fetch_ms: number;
  options_fetch_ms: number;
  popular_stats_ms: number;
  recommended_fetch_ms: number;
  payload_build_ms: number;
  response_size_bytes: number;
  query_count: number;
  cache_hit: boolean;
};

export type DeliveryMenusApiPhaseMarks = {
  authDone?: number;
  storeDone?: number;
  productsDone?: number;
  popularDone?: number;
  metaDone?: number;
  payloadDone?: number;
};

const PREFIX = "[delivery-menus-api-breakdown]";

export function deliveryMenusApiBreakdownEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.DIBAY_MENUS_API_BREAKDOWN === "1";
}

export function createMenusApiPhaseMarks(startedAt: number): DeliveryMenusApiPhaseMarks {
  return { authDone: startedAt, storeDone: startedAt };
}

export function buildDeliveryMenusApiBreakdown(opts: {
  slug: string;
  startedAt: number;
  marks: DeliveryMenusApiPhaseMarks;
  payloadBuildMs: number;
  responseSizeBytes: number;
  queryCount: number;
  cacheHit: boolean;
}): DeliveryMenusApiBreakdown {
  const t0 = opts.startedAt;
  const m = opts.marks;
  const ms = (from?: number, to?: number) => {
    if (from == null || to == null) return 0;
    return Math.max(0, Math.round(to - from));
  };

  const storeLookupMs = ms(t0, m.storeDone);
  const authMs = ms(t0, m.authDone);
  const productsFetchMs = ms(m.storeDone, m.productsDone);
  const popularStatsMs = ms(m.storeDone, m.popularDone);
  const metaMs = ms(m.storeDone, m.metaDone);
  const payloadBuildMs = Math.max(0, Math.round(opts.payloadBuildMs));

  return {
    event: "menus_api_breakdown",
    slug: opts.slug.trim().toLowerCase(),
    total_ms: ms(t0, m.payloadDone ?? t0 + opts.payloadBuildMs),
    auth_ms: authMs,
    store_lookup_ms: storeLookupMs,
    categories_fetch_ms: 0,
    products_fetch_ms: productsFetchMs,
    options_fetch_ms: 0,
    popular_stats_ms: popularStatsMs,
    recommended_fetch_ms: metaMs,
    payload_build_ms: payloadBuildMs,
    response_size_bytes: opts.responseSizeBytes,
    query_count: opts.queryCount,
    cache_hit: opts.cacheHit,
  };
}

export function logDeliveryMenusApiBreakdown(breakdown: DeliveryMenusApiBreakdown): void {
  if (!deliveryMenusApiBreakdownEnabled()) return;
  console.info(PREFIX, breakdown);
}
