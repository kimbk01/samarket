/**
 * 7단계: 관심상품 필터·정렬 옵션
 */

import type { FavoriteProduct } from "@/lib/types/favorite";

export type FavoriteStatusFilter = "all" | "active" | "reserved" | "sold";

export const FAVORITE_STATUS_OPTIONS: { value: FavoriteStatusFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "active", label: "판매중" },
  { value: "reserved", label: "예약중" },
  { value: "sold", label: "판매완료" },
];

export type FavoriteSortKey = "favorited" | "latest" | "price_asc";

export const FAVORITE_SORT_OPTIONS: { value: FavoriteSortKey; label: string }[] = [
  { value: "favorited", label: "최근 찜순" },
  { value: "latest", label: "최신 등록순" },
  { value: "price_asc", label: "가격 낮은순" },
];

export function filterFavoriteByStatus(
  list: FavoriteProduct[],
  filter: FavoriteStatusFilter
): FavoriteProduct[] {
  if (filter === "all") return list;
  return list.filter((p) => p.status === filter);
}

export function sortFavorites(
  list: FavoriteProduct[],
  sortKey: FavoriteSortKey
): FavoriteProduct[] {
  const copy = [...list];
  if (sortKey === "favorited") {
    copy.sort((a, b) => new Date(b.favoritedAt).getTime() - new Date(a.favoritedAt).getTime());
  } else if (sortKey === "latest") {
    copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else {
    copy.sort((a, b) => a.price - b.price);
  }
  return copy;
}
