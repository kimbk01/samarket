/** `[route-cache-hit]` / `[route-cache-miss]` — startup·handler 측정용 (compile 제외) */
export function logRouteCacheHit(
  route: string,
  meta: Record<string, string | number | boolean | null | undefined>
): void {
  if (process.env.NODE_ENV === "production" && process.env.SAMARKET_ROUTE_CACHE_LOG !== "1") {
    return;
  }
  // eslint-disable-next-line no-console -- observability contract
  console.log("[route-cache-hit]", { route, ...meta });
}

export function logRouteCacheMiss(
  route: string,
  meta: Record<string, string | number | boolean | null | undefined>
): void {
  if (process.env.NODE_ENV === "production" && process.env.SAMARKET_ROUTE_CACHE_LOG !== "1") {
    return;
  }
  // eslint-disable-next-line no-console -- observability contract
  console.log("[route-cache-miss]", { route, ...meta });
}
