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
  /** 상세 히어로·진입 시드 — `store_banners` 첫 활성 이미지 */
  heroBannerImageUrl: string | null;
  isFeatured: boolean;
  /** business_hours_json 확장 — 카드 요약 */
  estPrepLabel: string;
  /** 조리 분(파서 기준). 목록 ETA 합산에 사용 */
  prepMinutes: number | null;
  /**
   * Google 라우트 구간 분 — 목록 API에서는 항상 null(조리·기본 안내만).
   * 상세·주문 등에서만 채울 수 있음.
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
  /** 카드 표시 거리(km): browse/home-feed 는 haversine 직선만 */
  distanceKm?: number | null;
  /** 직선거리(km) — user_lat/lng 있을 때 */
  straightDistanceKm?: number | null;
  /** @deprecated 목록 API에서 미포함. 주문·상세 전용. */
  routeDistanceKm?: number | null;
};
