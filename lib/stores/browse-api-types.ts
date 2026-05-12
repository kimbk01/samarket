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
  /**
   * Google 라우트(오토바이·폴백) 구간 분 — ETA `배달 약 …분` 용.
   * 목록 **거리 표시**는 경로 거리 우선, 실패 시 직선거리 fallback.
   */
  rideMinutes: number | null;
  /** 카드 시간 줄 — browse 에서는 `buildBrowseStoreListEtaLabel` 결과 */
  etaLabel: string;
  /** browse/home-feed: `배달비 …` 주 문구 — 없으면 null */
  deliveryFeeLabel: string | null;
  /** self_free_promo: 취소선용 원래 배달비(페소) */
  deliveryFeeStrikePhp: number | null;
  /** `payment_methods`·`payment_methods_config` 기반 결제 안내 한 줄 */
  paymentMethodsLine: string;
  minOrderLabel: string | null;
  /** 카드 표시 거리(km): 경로 거리 우선, Routes 실패 시 직선거리 */
  distanceKm?: number | null;
  /** 요청에 user_lat/user_lng 있을 때만 계산되는 직선거리(km) */
  straightDistanceKm?: number | null;
  /** Routes API 경로 거리(km) */
  routeDistanceKm?: number | null;
};
