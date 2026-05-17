/** GET /api/me/stores/:id/inquiries — 짧은 서버 캐시 (탭 재진입·중복 fetch 흡수) */

export type OwnerInquiriesListPayload = {
  ok: true;
  inquiries: unknown[];
};

const TTL_MS = 8_000;

const cache = new Map<string, { expiresAt: number; value: OwnerInquiriesListPayload }>();
const flights = new Map<string, Promise<OwnerInquiriesListPayload>>();

function cacheKey(storeId: string): string {
  return storeId.trim();
}

export function invalidateOwnerStoreInquiriesListCache(storeId: string): void {
  const k = cacheKey(storeId);
  if (k) cache.delete(k);
}

export function peekOwnerStoreInquiriesListCacheHit(storeId: string): boolean {
  const key = cacheKey(storeId);
  if (!key) return false;
  const hit = cache.get(key);
  return !!hit && hit.expiresAt > Date.now();
}

export async function getCachedOwnerStoreInquiriesList(
  storeId: string,
  factory: () => Promise<OwnerInquiriesListPayload>
): Promise<{ payload: OwnerInquiriesListPayload; cache_hit: boolean }> {
  const key = cacheKey(storeId);
  if (!key) {
    return { payload: await factory(), cache_hit: false };
  }

  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return { payload: hit.value, cache_hit: true };
  }

  const existing = flights.get(key);
  if (existing) {
    const payload = await existing;
    return { payload, cache_hit: peekOwnerStoreInquiriesListCacheHit(storeId) };
  }

  const flight = factory()
    .then((value) => {
      cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
      return value;
    })
    .finally(() => {
      if (flights.get(key) === flight) flights.delete(key);
    });

  flights.set(key, flight);
  const payload = await flight;
  return { payload, cache_hit: false };
}
