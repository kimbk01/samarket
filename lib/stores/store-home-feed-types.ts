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
  /** 카드 표시 거리(km): 경로 거리 우선, Routes 실패 시 직선거리 */
  distanceKm: number | null;
  straightDistanceKm?: number | null;
  routeDistanceKm?: number | null;
  featuredItems: { productId: string; name: string; price: number }[];
  profileImageUrl: string | null;
  isFeatured: boolean;
};
