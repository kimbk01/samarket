import type { PersonalizedFeedPolicy } from "@/lib/types/personalized-feed";
import { PERSONALIZED_SECTION_LABELS } from "@/lib/personalized-feed/personalized-section-labels";

export function createDefaultPersonalizedFeedPolicies(): PersonalizedFeedPolicy[] {
  const now = new Date().toISOString();
  const base = (
    sectionKey: PersonalizedFeedPolicy["sectionKey"],
    weights: Partial<PersonalizedFeedPolicy>
  ): PersonalizedFeedPolicy => ({
    id: `pfp-${sectionKey}`,
    sectionKey,
    sectionLabel: PERSONALIZED_SECTION_LABELS[sectionKey],
    isActive: true,
    maxItems: 6,
    categoryAffinityWeight: 1,
    recentViewWeight: 0.5,
    recentFavoriteWeight: 0.5,
    recentChatWeight: 0.5,
    premiumBoostWeight: 5,
    businessBoostWeight: 3,
    nearbyWeight: 0.6,
    recencyWeight: 0.6,
    dedupeEnabled: true,
    createdAt: now,
    updatedAt: now,
    ...weights,
  });

  return [
    base("category_based", { categoryAffinityWeight: 1.5, adminMemo: "선호 카테고리 기반" }),
    base("interest_based", { recentFavoriteWeight: 0.8, adminMemo: "찜 카테고리 기반" }),
    base("recent_view_based", { recentViewWeight: 1.2, recencyWeight: 0.8, adminMemo: "최근 본 상품" }),
    base("recent_favorite_based", { recentFavoriteWeight: 1.2, adminMemo: "최근 찜" }),
    base("recent_chat_based", { recentChatWeight: 1.2, adminMemo: "최근 채팅" }),
  ];
}
