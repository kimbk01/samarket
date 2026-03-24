/**
 * 28단계: 노출 점수 정책 / 후보 / 결과 / 로그 타입
 */

import type { ProductStatus } from "@/lib/types/product";
import type { MemberType } from "@/lib/types/admin-user";

export type ExposureSurface = "home" | "search" | "shop_featured";

export type AdPromotionStatus = "none" | "active" | "scheduled" | "expired";

export type PointPromotionStatus = "none" | "active" | "scheduled" | "expired";

export type ShopFeaturedStatus = "none" | "active";

export interface ExposureScorePolicy {
  id: string;
  surface: ExposureSurface;
  isActive: boolean;
  policyName: string;
  latestWeight: number;
  popularWeight: number;
  nearbyWeight: number;
  premiumBoostWeight: number;
  businessBoostWeight: number;
  adBoostWeight: number;
  pointPromotionBoostWeight: number;
  bumpBoostWeight: number;
  exactRegionMatchWeight: number;
  sameCityWeight: number;
  sameBarangayWeight: number;
  createdAt: string;
  updatedAt: string;
  adminMemo?: string;
}

export interface ExposureCandidate {
  id: string;
  title: string;
  sellerId: string;
  sellerNickname: string;
  memberType: MemberType;
  businessProfileId: string | null;
  isBusinessItem: boolean;
  price: number;
  status: ProductStatus;
  likesCount: number;
  chatCount: number;
  viewCount: number;
  createdAt: string;
  bumpedAt: string | null;
  region: string;
  city: string;
  barangay: string;
  distance: number;
  adPromotionStatus: AdPromotionStatus;
  pointPromotionStatus: PointPromotionStatus;
  shopFeaturedStatus: ShopFeaturedStatus;
  exposureScore?: number;
  exposureReasons?: string[];
}

export interface ExposureScoreResult {
  candidateId: string;
  surface: ExposureSurface;
  baseLatestScore: number;
  basePopularScore: number;
  baseNearbyScore: number;
  premiumBoostScore: number;
  businessBoostScore: number;
  adBoostScore: number;
  pointPromotionBoostScore: number;
  bumpBoostScore: number;
  regionMatchScore: number;
  finalScore: number;
  appliedReasons: string[];
  calculatedAt: string;
}

export type ExposurePolicyLogActionType =
  | "create"
  | "update"
  | "activate"
  | "deactivate"
  | "simulate";

export interface ExposurePolicyLog {
  id: string;
  policyId: string;
  surface: ExposureSurface;
  actionType: ExposurePolicyLogActionType;
  adminId: string;
  adminNickname: string;
  note: string;
  createdAt: string;
}
