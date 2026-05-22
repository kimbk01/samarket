export type RouteCacheBypassReason = "perfCold" | "fresh" | "bypassCache";

/**
 * 서버 메모리 TTL 캐시 read 우회 — `perfCold=1` | `fresh=1` | `bypassCache=1`.
 * flush/삭제 없음. 일반 요청(파라미 없음)은 기존 캐시 유지.
 */
export function resolveRouteMemoryCacheBypass(
  searchParams: URLSearchParams | { get(name: string): string | null }
): { bypass: boolean; reason: RouteCacheBypassReason | null } {
  if (searchParams.get("perfCold") === "1") return { bypass: true, reason: "perfCold" };
  if (searchParams.get("fresh") === "1") return { bypass: true, reason: "fresh" };
  if (searchParams.get("bypassCache") === "1") return { bypass: true, reason: "bypassCache" };
  return { bypass: false, reason: null };
}

export function shouldBypassRouteMemoryCache(
  searchParams: URLSearchParams | { get(name: string): string | null }
): boolean {
  return resolveRouteMemoryCacheBypass(searchParams).bypass;
}
export function appendBypassCacheQuery(url: string, bypass?: boolean): string {
  if (!bypass) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}bypassCache=1`;
}
