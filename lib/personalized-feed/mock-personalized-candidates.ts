/**
 * 30단계: 개인화 추천 후보 mock (29단계 FeedCandidate 기반)
 */

import type { PersonalizedCandidate } from "@/lib/types/personalized-feed";
import type { FeedCandidate } from "@/lib/types/home-feed";

function feedCandidateToPersonalized(c: FeedCandidate): PersonalizedCandidate {
  return {
    id: c.id,
    title: c.title,
    category: c.category,
    sellerId: c.sellerId,
    sellerNickname: c.sellerNickname,
    memberType: c.memberType,
    businessProfileId: c.businessProfileId,
    isBusinessItem: c.isBusinessItem,
    status: c.status,
    price: c.price,
    thumbnail: c.thumbnail,
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
    personalizedReasons: [],
  };
}

export function getPersonalizedCandidatesFromFeedCandidates(
  feedCandidates: FeedCandidate[]
): PersonalizedCandidate[] {
  return feedCandidates.map(feedCandidateToPersonalized);
}
