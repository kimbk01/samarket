import type { BrowseStoreCommerceSnapshot } from "@/lib/stores/browse-store-commerce-snapshot";

/** GET /api/stores/home-feed — 매장 탭 피드 카드 */
export type StoreHomeFeedItem = {
  id: string;
  slug: string;
  nameKo: string;
  tagline: string | null;
  primarySlug: string | null;
  primaryNameKo: string | null;
  regionLabel: string;
  status: "open" | "preparing" | "closed";
  rating: number;
  reviewCount: number;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  /** 최소주문금액(페소) — 없으면 null */
  minOrderLabel: string | null;
  estPrepLabel: string;
  prepMinutes: number | null;
  rideMinutes: number | null;
  etaLabel: string;
  /** `배달비 …` 주 문구 — 없으면 null */
  deliveryFeeLabel: string | null;
  /** self_free_promo: 취소선용 원래 배달비(페소) */
  deliveryFeeStrikePhp: number | null;
  /** 매장 결제 안내 한 줄 */
  paymentMethodsLine: string;
  /** 카드 표시 거리(km): home-feed 는 haversine 직선만 */
  distanceKm: number | null;
  straightDistanceKm?: number | null;
  /** Admin 거리 정책 적용 여부 (serviceability) */
  distancePolicyApplied?: boolean;
  /** 배달 가능 거리 초과 (또는 매장 좌표 없음으로 판정 불가) */
  distanceOutOfRange?: boolean;
  maxDeliveryDistanceKm?: number | null;
  /** @deprecated home-feed 응답에서 미포함. 주문·상세 전용. */
  routeDistanceKm?: number | null;
  featuredItems: { productId: string; name: string; price: number; imageUrl?: string | null }[];
  profileImageUrl: string | null;
  isFeatured: boolean;
  commerce: BrowseStoreCommerceSnapshot;
  /** P1-A — completed orders created within STORE_POPULARITY_WINDOW_DAYS */
  completedOrderCount30d?: number;
  /** P0 eligibility rank for home popular shelf sort */
  discoveryEligibilityRank?: number;
};
