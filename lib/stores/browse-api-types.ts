/** GET /api/stores/browse 응답 — 카드 UI 공용 */
export type BrowseStoreListItem = {
  id: string;
  slug: string;
  nameKo: string;
  tagline: string | null;
  primarySlug: string;
  subSlug: string;
  primaryNameKo: string;
  subNameKo: string;
  regionLabel: string;
  status: "open" | "preparing" | "closed";
  rating: number;
  reviewCount: number;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  visitAvailable: boolean;
  featuredItems: { productId: string; name: string; price: number }[];
  profileImageUrl: string | null;
  isFeatured: boolean;
  /** business_hours_json 확장 — 카드 요약 */
  estPrepLabel: string;
  deliveryFeeLabel: string | null;
  minOrderLabel: string | null;
  /** 요청에 user_lat/user_lng 있을 때만 */
  distanceKm?: number | null;
};
