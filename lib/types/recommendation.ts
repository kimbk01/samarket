/**
 * 31단계: 최근 본 상품 / 행동 이벤트 / 추천 노출·성과 타입
 */

export type RecentViewSource =
  | "home"
  | "search"
  | "chat"
  | "recommendation"
  | "shop";

export interface RecentViewedProduct {
  id: string;
  userId: string;
  productId: string;
  viewedAt: string;
  source: RecentViewSource;
  sectionKey: string | null;
  dedupeKey: string;
}

export type BehaviorEventType =
  | "product_view"
  | "favorite_add"
  | "favorite_remove"
  | "chat_start"
  | "search_submit"
  | "home_section_click"
  | "recommendation_click"
  | "shop_view";

export interface UserBehaviorEvent {
  id: string;
  userId: string;
  eventType: BehaviorEventType;
  productId: string | null;
  targetId: string | null;
  sectionKey: string | null;
  query: string | null;
  category: string | null;
  region: string | null;
  city: string | null;
  barangay: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export type RecommendationSurface = "home" | "search" | "shop";

export type RecommendationCandidateType = "product" | "shop" | "sponsored";

export interface RecommendationImpression {
  id: string;
  userId: string;
  surface: RecommendationSurface;
  sectionKey: string;
  candidateId: string;
  candidateType: RecommendationCandidateType;
  impressionAt: string;
  clicked: boolean;
  clickedAt: string | null;
  converted: boolean;
  convertedAt: string | null;
  reasonLabel: string;
  score: number;
}

export interface RecommendationAnalyticsSummary {
  id: string;
  surface: RecommendationSurface;
  sectionKey: string;
  impressionCount: number;
  clickCount: number;
  conversionCount: number;
  ctr: number;
  conversionRate: number;
  avgScore: number;
  topReason: string;
  updatedAt: string;
}

export interface UserBehaviorInsight {
  userId: string;
  topCategories: string[];
  topRegions: string[];
  totalViews: number;
  totalFavorites: number;
  totalChatsStarted: number;
  lastActiveAt: string;
}
