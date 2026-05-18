/**
 * 7단계: 관심상품 필터·정렬 옵션
 */

import type { FavoriteProduct } from "@/lib/types/favorite";

export type FavoriteStatusFilter = "all" | "active" | "reserved" | "sold";

export const FAVORITE_STATUS_OPTIONS: {
  value: FavoriteStatusFilter;
  labelKey: "ui_fav_filter_all" | "ui_fav_filter_active" | "ui_fav_filter_reserved" | "ui_fav_filter_sold";
}[] = [
  { value: "all", labelKey: "ui_fav_filter_all" },
  { value: "active", labelKey: "ui_fav_filter_active" },
  { value: "reserved", labelKey: "ui_fav_filter_reserved" },
  { value: "sold", labelKey: "ui_fav_filter_sold" },
];

export type FavoriteSortKey = "favorited" | "latest" | "price_asc";

export const FAVORITE_SORT_OPTIONS: {
  value: FavoriteSortKey;
  labelKey: "ui_fav_sort_favorited" | "ui_fav_sort_latest" | "ui_fav_sort_price_asc";
}[] = [
  { value: "favorited", labelKey: "ui_fav_sort_favorited" },
  { value: "latest", labelKey: "ui_fav_sort_latest" },
  { value: "price_asc", labelKey: "ui_fav_sort_price_asc" },
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
