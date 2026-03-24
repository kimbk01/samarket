/**
 * 29단계: 피드 후보 mock (28단계 exposure 후보 + 썸네일/카테고리/소스태그)
 */

import type { FeedCandidate } from "@/lib/types/home-feed";
import { getExposureCandidatesForHome } from "@/lib/exposure/mock-exposure-candidates";
import { getProductById } from "@/lib/mock-products";
import { computeExposureScore } from "@/lib/exposure/exposure-score-utils";
import { getExposureScorePolicyBySurface } from "@/lib/exposure/mock-exposure-score-policies";
import type { UserRegionContext } from "@/lib/exposure/exposure-score-utils";

export function getFeedCandidates(
  regionName?: string,
  userRegion?: UserRegionContext | null
): FeedCandidate[] {
  const exposureCandidates = getExposureCandidatesForHome(regionName);
  const policy = getExposureScorePolicyBySurface("home");

  return exposureCandidates.map((c) => {
    const product = getProductById(c.id);
    const sourceTags: string[] = [];
    if (c.memberType === "premium") sourceTags.push("premium");
    if (c.isBusinessItem) sourceTags.push("business");
    if (c.adPromotionStatus === "active") sourceTags.push("ad");
    if (c.pointPromotionStatus === "active") sourceTags.push("point_promo");
    if (c.shopFeaturedStatus === "active") sourceTags.push("shop_featured");
    if (c.bumpedAt) sourceTags.push("bumped");

    let exposureScore: number | undefined;
    if (policy) {
      const result = computeExposureScore(c, policy, "home", userRegion ?? null);
      exposureScore = result.finalScore;
    }

    return {
      id: c.id,
      title: c.title,
      sellerId: c.sellerId,
      sellerNickname: c.sellerNickname,
      memberType: c.memberType,
      businessProfileId: c.businessProfileId,
      isBusinessItem: c.isBusinessItem,
      status: c.status,
      category: product?.category ?? "",
      price: c.price,
      thumbnail: product?.thumbnail ?? "",
      createdAt: c.createdAt,
      bumpedAt: c.bumpedAt,
      region: c.region,
      city: c.city,
      barangay: c.barangay,
      distance: c.distance,
      likesCount: c.likesCount,
      chatCount: c.chatCount,
      viewCount: c.viewCount,
      adPromotionStatus: c.adPromotionStatus,
      pointPromotionStatus: c.pointPromotionStatus,
      shopFeaturedStatus: c.shopFeaturedStatus,
      exposureScore,
      sourceTags,
    };
  });
}
