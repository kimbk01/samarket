import { runSingleFlight } from "@/lib/http/run-single-flight";

/** API Route Handler 연속 hit — getClaims 로컬 검증 결과 (JWT 만료 전·auth 쿠키 동일) */
export const API_ROUTE_AUTH_WARM_TTL_MS = 12_000;

export type ApiRouteAuthWarmSource = "claims" | "get_user";

export type ApiRouteAuthWarmEntry = {
  userId: string;
  email: string | null;
  claimsOnly: boolean;
  authSource: ApiRouteAuthWarmSource;
  expiresAt: number;
};

type ApiRouteAuthWarmCacheGlobal = {
  __samarketApiRouteAuthWarmCache?: Map<string, ApiRouteAuthWarmEntry>;
};

function cacheMap(): Map<string, ApiRouteAuthWarmEntry> {
  const g = globalThis as ApiRouteAuthWarmCacheGlobal;
  if (!g.__samarketApiRouteAuthWarmCache) {
    g.__samarketApiRouteAuthWarmCache = new Map();
  }
  return g.__samarketApiRouteAuthWarmCache;
}

export function peekApiRouteAuthWarmCache(fingerprint: string): ApiRouteAuthWarmEntry | null {
  const fp = fingerprint.trim();
  if (!fp || fp === "∅") return null;
  const hit = cacheMap().get(fp);
  if (!hit || hit.expiresAt <= Date.now()) {
    if (hit) cacheMap().delete(fp);
    return null;
  }
  return hit;
}

export function setApiRouteAuthWarmCache(
  fingerprint: string,
  entry: Omit<ApiRouteAuthWarmEntry, "expiresAt">
): void {
  const fp = fingerprint.trim();
  const uid = entry.userId.trim();
  if (!fp || fp === "∅" || !uid) return;
  cacheMap().set(fp, { ...entry, userId: uid, expiresAt: Date.now() + API_ROUTE_AUTH_WARM_TTL_MS });
  while (cacheMap().size > 800) {
    const k = cacheMap().keys().next().value;
    if (k === undefined) break;
    cacheMap().delete(k);
  }
}

export function apiRouteAuthResolveFlightKey(fingerprint: string): string {
  return `api-route-auth-resolve:${fingerprint.trim() || "∅"}`;
}

export async function runApiRouteAuthResolveSingleFlight<T>(
  fingerprint: string,
  fn: () => Promise<T>
): Promise<T> {
  return runSingleFlight(apiRouteAuthResolveFlightKey(fingerprint), fn);
}
