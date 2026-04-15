/**
 * `GET /api/trade/feed` · 마켓 RSC 부트스트랩 공용 — 찜 맵 짧은 TTL 캐시.
 *
 * - 키: `viewerUserId|정렬된 postId 목록` — 페이지 구성이 바뀌면 자연스럽게 미스.
 * - `mutationEpoch`: `invalidatePostFavoriteServerCachesForViewer` 가 올리는 세대와 맞아야 히트.
 * - 무효화: `clearTradeFeedFavoritesCacheKeysForViewerPrefix` + 에폭 (`invalidate-post-favorite-server-caches`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { fetchFavoriteMapForPostIds } from "@/lib/posts/fetch-favorite-map-for-post-ids";
import { getPostFavoriteMutationEpochForViewer } from "@/lib/posts/post-favorites-viewer-mutation-epoch";

const TRADE_FEED_FAVORITES_CACHE_TTL_MS = 12_000;

const tradeFeedFavoritesCache = new Map<
  string,
  { favoriteMap: Record<string, boolean>; expiresAt: number; mutationEpoch: number }
>();

/** 토글 직후 메모리 상한 — 키만 제거, 에폭은 `invalidatePostFavoriteServerCachesForViewer` 에서 처리 */
export function clearTradeFeedFavoritesCacheKeysForViewerPrefix(viewerUserId: string): void {
  const u = viewerUserId.trim();
  if (!u) return;
  for (const k of tradeFeedFavoritesCache.keys()) {
    if (k.startsWith(`${u}|`)) tradeFeedFavoritesCache.delete(k);
  }
}

async function fetchFavoriteMapWithEpochRetry(
  favoritesSb: SupabaseClient<any>,
  uid: string,
  ids: string[]
): Promise<Record<string, boolean>> {
  let e0 = getPostFavoriteMutationEpochForViewer(uid);
  let map = await fetchFavoriteMapForPostIds(favoritesSb, uid, ids);
  if (getPostFavoriteMutationEpochForViewer(uid) !== e0) {
    map = await fetchFavoriteMapForPostIds(favoritesSb, uid, ids);
  }
  return map;
}

function maybePruneExpiredEntries(): void {
  if (tradeFeedFavoritesCache.size < 120) return;
  if (Math.random() < 0.08) {
    const now = Date.now();
    for (const [k, v] of tradeFeedFavoritesCache) {
      if (v.expiresAt <= now) tradeFeedFavoritesCache.delete(k);
    }
  }
}

export function buildTradeFeedFavoritesCacheKey(viewerUserId: string, postIds: string[]): string {
  const uid = viewerUserId.trim();
  const ids = [...new Set(postIds.map((x) => String(x).trim()).filter(Boolean))].sort().join(",");
  return `${uid}|${ids}`;
}

/**
 * 로그인 사용자 + 글이 있을 때만 DB 조회; 캐시 히트 시 TTL 내 재사용.
 */
export async function getTradeFeedFavoriteMapCached(
  favoritesSb: SupabaseClient<any>,
  viewerUserId: string,
  postIds: string[]
): Promise<Record<string, boolean>> {
  const ids = [...new Set(postIds.map((x) => String(x).trim()).filter(Boolean))].sort();
  const empty: Record<string, boolean> = Object.fromEntries(ids.map((id) => [id, false]));
  const uid = viewerUserId.trim();
  if (!uid || ids.length === 0) return empty;

  maybePruneExpiredEntries();
  const key = buildTradeFeedFavoritesCacheKey(uid, ids);
  const epochNow = getPostFavoriteMutationEpochForViewer(uid);
  const hit = tradeFeedFavoritesCache.get(key);
  if (
    hit &&
    hit.expiresAt > Date.now() &&
    hit.mutationEpoch === epochNow
  ) {
    return { ...empty, ...hit.favoriteMap };
  }

  const flightKey = `trade-feed-favorites:${key}`;
  return runSingleFlight(flightKey, async () => {
    const epochInside = getPostFavoriteMutationEpochForViewer(uid);
    const again = tradeFeedFavoritesCache.get(key);
    if (
      again &&
      again.expiresAt > Date.now() &&
      again.mutationEpoch === epochInside
    ) {
      return { ...empty, ...again.favoriteMap };
    }
    const favoriteMap = await fetchFavoriteMapWithEpochRetry(favoritesSb, uid, ids);
    const epochToStore = getPostFavoriteMutationEpochForViewer(uid);
    tradeFeedFavoritesCache.set(key, {
      favoriteMap: { ...favoriteMap },
      expiresAt: Date.now() + TRADE_FEED_FAVORITES_CACHE_TTL_MS,
      mutationEpoch: epochToStore,
    });
    return favoriteMap;
  });
}
