/** 홈·카테고리 리스트 ↔ 찜 목록 시트 ↔ 상세 등 같은 탭에서 게시글 찜 상태 동기화 */
export const POST_FAVORITE_CHANGED_EVENT = "samarket-post-favorite-changed";

export type PostFavoriteChangedDetail = {
  postId: string;
  isFavorite: boolean;
};

export function dispatchPostFavoriteChanged(detail: PostFavoriteChangedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PostFavoriteChangedDetail>(POST_FAVORITE_CHANGED_EVENT, { detail })
  );
}
