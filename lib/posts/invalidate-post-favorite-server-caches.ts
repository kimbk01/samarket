/**
 * 게시글 찜(post favorites) 변경 후 **서버 프로세스** 내 찜 맵 캐시를 일관되게 무효화한다.
 *
 * 호출 위치: `POST /api/favorites/toggle` 성공(추가·삭제) 직후. 다른 경로에서 `favorites` 를 직접
 * 조작하면 동일 함수를 호출해 캐시·에폭을 맞춘다.
 */
import { bumpPostFavoriteMutationEpochForViewer } from "@/lib/posts/post-favorites-viewer-mutation-epoch";
import { clearHomePostsFavoriteCacheKeysForViewerPrefix } from "@/lib/posts/home-posts-route-core";
import { clearTradeFeedFavoritesCacheKeysForViewerPrefix } from "@/lib/posts/trade-feed-favorites-server-cache";

export function invalidatePostFavoriteServerCachesForViewer(viewerUserId: string): void {
  const u = viewerUserId.trim();
  if (!u) return;
  bumpPostFavoriteMutationEpochForViewer(u);
  clearTradeFeedFavoritesCacheKeysForViewerPrefix(u);
  clearHomePostsFavoriteCacheKeysForViewerPrefix(u);
}
