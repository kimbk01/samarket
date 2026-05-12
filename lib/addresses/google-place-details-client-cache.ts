import { fetchPlaceDetailsAsLegacyPlaceResult } from "@/lib/map/places-new-api";

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; place: google.maps.places.PlaceResult }>();

/**
 * 동일 세션에서 `place_id` 상세 반복 호출을 줄이기 위한 짧은 메모리 캐시.
 */
export async function fetchPlaceDetailsAsLegacyPlaceResultCached(
  placeId: string,
  fieldIds: readonly string[],
  opts?: { ttlMs?: number }
): Promise<google.maps.places.PlaceResult | null> {
  const id = placeId.trim();
  if (!id) return null;
  const ttl = opts?.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();
  const hit = cache.get(id);
  if (hit && hit.expiresAt > now) {
    return hit.place;
  }
  const place = await fetchPlaceDetailsAsLegacyPlaceResult(id, fieldIds);
  if (place) {
    cache.set(id, { expiresAt: now + ttl, place });
  }
  return place;
}

/** 테스트·로그아웃 등에서 캐시 비우기 */
export function clearPlaceDetailsClientCache(): void {
  cache.clear();
}
