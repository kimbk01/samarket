/** `[route-perf]` — single-flight·TTL·응답 캐시 계측 공통 필드 */
export function shortUserIdForPerf(userId: string | null | undefined): string {
  const u = (userId ?? "").trim();
  if (!u) return "";
  return u.length <= 8 ? u : u.slice(0, 8);
}

export type RoutePerfDedupeFields = {
  in_flight_hit?: 0 | 1;
  response_cache_hit?: 0 | 1;
  ttl_cache_hit?: 0 | 1;
  query_type?: string;
  user_id_short?: string;
  request_dedupe_key?: string;
  cache_hit_reason?: string;
  dedupe_hit_reason?: string;
};

export function buildRoutePerfDedupeFields(input: {
  userId?: string | null;
  dedupeKey?: string;
  inFlightHit?: boolean;
  responseCacheHit?: boolean;
  ttlCacheHit?: boolean;
  queryType?: string;
  cacheHitReason?: string;
  dedupeHitReason?: string;
}): RoutePerfDedupeFields {
  const o: RoutePerfDedupeFields = {};
  if (input.inFlightHit) o.in_flight_hit = 1;
  if (input.responseCacheHit) o.response_cache_hit = 1;
  if (input.ttlCacheHit) o.ttl_cache_hit = 1;
  if (input.queryType) o.query_type = input.queryType;
  const short = shortUserIdForPerf(input.userId ?? null);
  if (short) o.user_id_short = short;
  if (input.dedupeKey) o.request_dedupe_key = input.dedupeKey;
  if (input.cacheHitReason) o.cache_hit_reason = input.cacheHitReason;
  if (input.dedupeHitReason) o.dedupe_hit_reason = input.dedupeHitReason;
  return o;
}

export function readClientCallSourceFromRequest(request: Request): string {
  return (request.headers.get("x-samarket-client-call-source") ?? "").trim().slice(0, 64);
}

export function readCallerComponentFromRequest(request: Request): string {
  return (request.headers.get("x-samarket-caller-component") ?? "").trim().slice(0, 64);
}

export function readRouteTransitionSourceFromRequest(request: Request): string {
  return (request.headers.get("x-samarket-route-transition-source") ?? "").trim().slice(0, 120);
}

export function buildRoutePerfClientObservability(input: {
  request?: Request;
  deferred?: boolean;
  firstPaintBlocking?: boolean;
  liteTradeEnrichSkipped?: boolean;
  backgroundHydrationScheduled?: boolean;
}): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  if (input.request) {
    const src = readClientCallSourceFromRequest(input.request);
    if (src) o.client_call_source = src;
    const caller = readCallerComponentFromRequest(input.request);
    if (caller) o.caller_component = caller;
    const routeTransition = readRouteTransitionSourceFromRequest(input.request);
    if (routeTransition) o.route_transition_source = routeTransition;
  }
  if (input.deferred === true) o.deferred = true;
  if (input.deferred === false) o.deferred = false;
  if (input.firstPaintBlocking === true) o.first_paint_blocking = true;
  if (input.firstPaintBlocking === false) o.first_paint_blocking = false;
  if (input.liteTradeEnrichSkipped === true) o.lite_trade_enrich_skipped = true;
  if (input.backgroundHydrationScheduled === true) o.background_hydration_scheduled = true;
  return o;
}
