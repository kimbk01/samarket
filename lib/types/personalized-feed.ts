/**
 * 30단계: 개인화 피드 정책 / 사용자 행동 프로필 / 추천 후보·결과·로그 타입
 */

import type { ProductStatus } from "@/lib/types/product";
import type { MemberType } from "@/lib/types/admin-user";
import type { AdPromotionStatus, PointPromotionStatus, ShopFeaturedStatus } from "@/lib/types/exposure";

export type PersonalizedSectionKey =
  | "category_based"
  | "interest_based"
  | "recent_view_based"
  | "recent_favorite_based"
  | "recent_chat_based";

export interface PersonalizedFeedPolicy {
  id: string;
  sectionKey: PersonalizedSectionKey;
  sectionLabel: string;
  isActive: boolean;
  maxItems: number;
  categoryAffinityWeight: number;
  recentViewWeight: number;
  recentFavoriteWeight: number;
  recentChatWeight: number;
  premiumBoostWeight: number;
  businessBoostWeight: number;
  nearbyWeight: number;
  recencyWeight: number;
  dedupeEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  adminMemo?: string;
}

export interface UserBehaviorProfile {
  userId: string;
  favoriteCategories: string[];
  recentViewedProductIds: string[];
  recentViewedCategories: string[];
  recentFavoritedProductIds: string[];
  recentFavoritedCategories: string[];
  recentChattedProductIds: string[];
  recentChattedCategories: string[];
  preferredRegion: string;
  preferredCity: string;
  preferredBarangay: string;
  updatedAt: string;
}

export interface PersonalizedCandidate {
  id: string;
  title: string;
  category: string;
  sellerId: string;
  sellerNickname: string;
  memberType: MemberType;
  businessProfileId: string | null;
  isBusinessItem: boolean;
  status: ProductStatus;
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
  personalizedScore?: number;
  personalizedReasons: string[];
}

export interface PersonalizedFeedItem {
  id: string;
  targetId: string;
  title: string;
  thumbnail: string;
  price: number;
  locationLabel: string;
  reasonLabel: string;
  score: number;
  category?: string;
}

export interface PersonalizedFeedResult {
  sectionKey: PersonalizedSectionKey;
  items: PersonalizedFeedItem[];
  generatedAt: string;
}

export interface PersonalizedFeedLog {
  id: string;
  userId: string;
  sectionKey: PersonalizedSectionKey;
  candidateCount: number;
  finalCount: number;
  dedupedCount: number;
  topReason: string;
  createdAt: string;
  note: string;
}
