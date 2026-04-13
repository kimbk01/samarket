import type { PostWithMeta } from "@/lib/posts/schema";

/** 스펙 서비스 타입 — `category.icon_key`·`meta` 기준으로 결정 */
export type ServiceSegment = "used" | "car" | "real_estate" | "exchange" | "job";

export type CategoryLite = {
  id: string;
  icon_key: string;
  parent_id?: string | null;
  name?: string;
};

/** 상세 하단 카드 공통 (API 응답) */
export type DetailSectionItem = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  price: number | null;
  currency?: string | null;
  region?: string | null;
  city?: string | null;
  status?: string | null;
  /** 광고 슬롯 전용 */
  isAd?: boolean;
};

export type DetailSectionKey = "seller_items" | "related_items" | "ad_items";

export type DetailSectionDTO = {
  key: DetailSectionKey;
  title: string;
  items: DetailSectionItem[];
};

export type ListingDetailInput = {
  post: PostWithMeta;
  category: CategoryLite | null;
  segment: ServiceSegment;
};
