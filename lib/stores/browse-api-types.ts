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
  reservationAvailable?: boolean;
  featuredItems: { productId: string; name: string; price: number; imageUrl?: string | null }[];
  profileImageUrl: string | null;
  isFeatured: boolean;
  /** business_hours_json 확장 — 카드 요약 */
  estPrepLabel: string;
  /** 조리 분(파서 기준). 목록 ETA 합산에 사용 */
  prepMinutes: number | null;
  /** Google 라우트(오토바이·폴백) 구간 분 — `user_lat`/`user_lng` 없거나 실패 시 null */
  rideMinutes: number | null;
  /** 카드 시간 줄 — `조리+라이딩` 또는 조리만 */
  etaLabel: string;
  deliveryFeeLabel: string | null;
  minOrderLabel: string | null;
  /** 요청에 user_lat/user_lng 있을 때만 */
  distanceKm?: number | null;
};
