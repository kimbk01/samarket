/**
 * 29단계: 홈 피드 정책 / 후보 / 결과 / 생성 로그 타입
 */

import type { ProductStatus } from "@/lib/types/product";
import type { MemberType } from "@/lib/types/admin-user";
import type { AdPromotionStatus, PointPromotionStatus, ShopFeaturedStatus } from "@/lib/types/exposure";

export type HomeFeedSectionKey =
  | "recommended"
  | "local_latest"
  | "bumped"
  | "sponsored"
  | "premium_shops"
  | "recent_based";

export type HomeFeedSortMode =
  | "featured"
  | "latest"
  | "nearby"
  | "popular"
  | "mixed";

export type HomeFeedRegionScope = "barangay" | "city" | "region";

export interface HomeFeedPolicy {
  id: string;
  sectionKey: HomeFeedSectionKey;
  sectionLabel: string;
  isActive: boolean;
  sortMode: HomeFeedSortMode;
  maxItems: number;
  allowSponsoredMix: boolean;
  allowPremiumBoost: boolean;
  allowBusinessBoost: boolean;
  allowPointPromotionBoost: boolean;
  dedupeEnabled: boolean;
  regionScope: HomeFeedRegionScope;
  priorityOrder: number;
  createdAt: string;
  updatedAt: string;
  adminMemo?: string;
}

export interface FeedCandidate {
  id: string;
  title: string;
  sellerId: string;
  sellerNickname: string;
  memberType: MemberType;
  businessProfileId: string | null;
  isBusinessItem: boolean;
  status: ProductStatus;
  category: string;
  price: number;
  thumbnail: string;
  createdAt: string;
  bumpedAt: string | null;
  region: string;
  city: string;
  barangay: string;
  distance: number;
  likesCount: number;
  chatCount: number;
  viewCount: number;
  adPromotionStatus: AdPromotionStatus;
  pointPromotionStatus: PointPromotionStatus;
  shopFeaturedStatus: ShopFeaturedStatus;
  exposureScore?: number;
  sourceTags: string[];
}

export type HomeFeedItemType = "product" | "sponsored" | "shop";

export interface HomeFeedItem {
  id: string;
  itemType: HomeFeedItemType;
  targetId: string;
  title: string;
  thumbnail: string;
  price: number;
  locationLabel: string;
  reasonLabel: string;
  score: number;
}

export interface HomeFeedSectionResult {
  sectionKey: HomeFeedSectionKey;
  items: HomeFeedItem[];
  generatedAt: string;
}

export interface HomeFeedGenerationLog {
  id: string;
  generatedAt: string;
  userRegion: string;
  userId: string;
  sectionKey: HomeFeedSectionKey;
  candidateCount: number;
  finalCount: number;
  dedupedCount: number;
  sponsoredIncluded: number;
  note: string;
}
