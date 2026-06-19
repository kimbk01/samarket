/** 찜 목록 — `/api/me/store-favorites/list` 응답 항목 */
export type FavoritedStoreListItem = {
  id: string;
  slug: string;
  store_name: string;
  profile_image_url: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  is_open: boolean | null;
  rating_avg: number | null;
  review_count: number | null;
  delivery_available: boolean | null;
  pickup_available: boolean | null;
  available: boolean;
  favorited_at: string;
};
