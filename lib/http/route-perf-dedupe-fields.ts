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
};

export function buildRoutePerfDedupeFields(input: {
  userId?: string | null;
  dedupeKey?: string;
  inFlightHit?: boolean;
  responseCacheHit?: boolean;
  ttlCacheHit?: boolean;
  queryType?: string;
}): RoutePerfDedupeFields {
  const o: RoutePerfDedupeFields = {};
  if (input.inFlightHit) o.in_flight_hit = 1;
  if (input.responseCacheHit) o.response_cache_hit = 1;
  if (input.ttlCacheHit) o.ttl_cache_hit = 1;
  if (input.queryType) o.query_type = input.queryType;
  const short = shortUserIdForPerf(input.userId ?? null);
  if (short) o.user_id_short = short;
  if (input.dedupeKey) o.request_dedupe_key = input.dedupeKey;
  return o;
}
