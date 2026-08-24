import type { BrowseStoreCommerceSnapshot } from "@/lib/stores/browse-store-commerce-snapshot";
import type { PlatformPopularProduct } from "@/lib/stores/assemble-platform-popular-products";

/** P1-B — stats-backed platform popular product on browse row (≠ owner representative tiles) */
export type BrowsePlatformPopularProduct = PlatformPopularProduct;

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
  status: "open" | "preparing" | "closed" | "resting";
  rating: number;
  reviewCount: number;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  visitAvailable: boolean;
  reservationAvailable?: boolean;
  featuredItems: { productId: string; name: string; price: number; imageUrl?: string | null }[];
  /** Optional — rank1 qualified platform popular; omitted when stats/catalog unavailable */
  platformPopularProduct?: BrowsePlatformPopularProduct | null;
  profileImageUrl: string | null;
  /** 상세 히어로·진입 시드 — `store_banners` 첫 활성 이미지 */
  heroBannerImageUrl: string | null;
  isFeatured: boolean;
  /** Shelf new_store signal only — unused by organic ranking. */
  firstListedAt?: string | null;
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
  /** 관리자 거리 정책으로 이 행에 거리 계산을 적용했는지 */
  distancePolicyApplied?: boolean;
  /** 관리자 최대 거리(km)를 초과했는지 — 목록에서는 하단 배치 */
  distanceOutOfRange?: boolean;
  /** 표시 거리 산식 */
  distanceSource?: "straight" | "google" | null;
  /** 이 행에 적용된 최대 거리(km) */
  maxDeliveryDistanceKm?: number | null;
  /** 카드 라벨 클라이언트 생성용 — 언어 중립 영업·결제 스냅샷 */
  commerce: BrowseStoreCommerceSnapshot;
};
