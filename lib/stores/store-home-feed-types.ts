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
  deliveryFeeLabel: string | null;
  distanceKm: number | null;
  featuredItems: { productId: string; name: string; price: number }[];
  profileImageUrl: string | null;
  isFeatured: boolean;
};
