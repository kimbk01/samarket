/**
 * 게시글(post) `favorites` 행이 바뀐 뷰어 기준 세대 번호.
 * 서버 메모리 캐시(홈·거래 피드 찜 맵)는 이 값과 함께 저장되며, 불일치 시 히트로 취급하지 않는다.
 *
 * 단일 진입점: `invalidatePostFavoriteServerCachesForViewer` (`lib/posts/invalidate-post-favorite-server-caches.ts`).
 */

const epochByViewer = new Map<string, number>();

export function bumpPostFavoriteMutationEpochForViewer(viewerUserId: string): void {
  const u = viewerUserId.trim();
  if (!u) return;
  epochByViewer.set(u, (epochByViewer.get(u) ?? 0) + 1);
}

export function getPostFavoriteMutationEpochForViewer(viewerUserId: string): number {
  return epochByViewer.get(viewerUserId.trim()) ?? 0;
}
