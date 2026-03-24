/** 매장 스티키 바·본문 찜 수 동기화(같은 탭) */
export const STORE_FAVORITE_CHANGED_EVENT = "kasama-store-favorite-changed";

export type StoreFavoriteChangedDetail = {
  slug: string;
  favorited: boolean;
  favorite_count: number;
};
