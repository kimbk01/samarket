/**
 * 업종 탐색 시뮬레이션 타입.
 * 행 연결: primaryIndustry → subIndustry → browseStore → menuGroup → menuItem
 * Supabase 매핑 예: store_categories(계층) / stores / store_products
 */

export type BrowseOpenStatus = "open" | "preparing" | "closed";

/** 1차 업종 (예: store_categories parent_id null) */
export interface BrowsePrimaryIndustry {
  id: string;
  slug: string;
  nameKo: string;
  sortOrder: number;
  /** 카드용 짧은 표시 (이모지 또는 아이콘 키) */
  symbol: string;
}

/** 2차 하위 업종 */
export interface BrowseSubIndustry {
  id: string;
  slug: string;
  nameKo: string;
  primarySlug: string;
  sortOrder: number;
}

/** 시뮬레이션 비즈 업체 (stores + 노출용 확장 필드) */
export interface BrowseMockStore {
  id: string;
  slug: string;
  nameKo: string;
  tagline: string;
  primarySlug: string;
  subSlug: string;
  regionLabel: string;
  status: BrowseOpenStatus;
  /** breadcrumb 표시용 */
  primaryNameKo: string;
  subNameKo: string;
  coverTint: string;
  logoEmoji: string;
  phone?: string;
  addressLine?: string;
  hoursSummary?: string;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  visitAvailable: boolean;
  reviewCount: number;
  rating: number;
  /** 카드·요약용 대표 라인 (상품 1~2개) */
  featuredItems: { name: string; price: number }[];
}

export interface BrowseMenuItem {
  name: string;
  price: number;
}

export interface BrowseMenuGroup {
  id: string;
  nameKo: string;
  items: BrowseMenuItem[];
}
