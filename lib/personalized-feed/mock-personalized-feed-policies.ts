/**
 * 30단계: 개인화 피드 정책 mock
 */

import type {
  PersonalizedFeedPolicy,
  PersonalizedSectionKey,
} from "@/lib/types/personalized-feed";

const now = new Date().toISOString();

const POLICIES: PersonalizedFeedPolicy[] = [
  {
    id: "pfp-category",
    sectionKey: "category_based",
    sectionLabel: "카테고리별 추천",
    isActive: true,
    maxItems: 6,
    categoryAffinityWeight: 1.5,
    recentViewWeight: 0.5,
    recentFavoriteWeight: 0.5,
    recentChatWeight: 0.5,
    premiumBoostWeight: 5,
    businessBoostWeight: 3,
    nearbyWeight: 0.8,
    recencyWeight: 0.6,
    dedupeEnabled: true,
    createdAt: now,
    updatedAt: now,
    adminMemo: "선호 카테고리 기반",
  },
  {
    id: "pfp-interest",
    sectionKey: "interest_based",
    sectionLabel: "관심 카테고리 추천",
    isActive: true,
    maxItems: 6,
    categoryAffinityWeight: 1.2,
    recentViewWeight: 0.3,
    recentFavoriteWeight: 0.8,
    recentChatWeight: 0.3,
    premiumBoostWeight: 5,
    businessBoostWeight: 3,
    nearbyWeight: 0.6,
    recencyWeight: 0.5,
    dedupeEnabled: true,
    createdAt: now,
    updatedAt: now,
    adminMemo: "찜 카테고리 기반",
  },
  {
    id: "pfp-recent-view",
    sectionKey: "recent_view_based",
    sectionLabel: "최근 본 상품과 비슷해요",
    isActive: true,
    maxItems: 6,
    categoryAffinityWeight: 1.0,
    recentViewWeight: 1.2,
    recentFavoriteWeight: 0.2,
    recentChatWeight: 0.2,
    premiumBoostWeight: 5,
    businessBoostWeight: 3,
    nearbyWeight: 0.7,
    recencyWeight: 0.8,
    dedupeEnabled: true,
    createdAt: now,
    updatedAt: now,
    adminMemo: "최근 본 상품 고도화",
  },
  {
    id: "pfp-recent-fav",
    sectionKey: "recent_favorite_based",
    sectionLabel: "찜한 상품과 비슷해요",
    isActive: true,
    maxItems: 6,
    categoryAffinityWeight: 1.0,
    recentViewWeight: 0.2,
    recentFavoriteWeight: 1.2,
    recentChatWeight: 0.2,
    premiumBoostWeight: 5,
    businessBoostWeight: 3,
    nearbyWeight: 0.6,
    recencyWeight: 0.5,
    dedupeEnabled: true,
    createdAt: now,
    updatedAt: now,
    adminMemo: "최근 찜 placeholder",
  },
  {
    id: "pfp-recent-chat",
    sectionKey: "recent_chat_based",
    sectionLabel: "최근 대화한 상품과 비슷해요",
    isActive: true,
    maxItems: 6,
    categoryAffinityWeight: 1.0,
    recentViewWeight: 0.2,
    recentFavoriteWeight: 0.2,
    recentChatWeight: 1.2,
    premiumBoostWeight: 5,
    businessBoostWeight: 3,
    nearbyWeight: 0.6,
    recencyWeight: 0.6,
    dedupeEnabled: true,
    createdAt: now,
    updatedAt: now,
    adminMemo: "최근 채팅 placeholder",
  },
];

export function getPersonalizedFeedPolicies(): PersonalizedFeedPolicy[] {
  return [...POLICIES];
}

export function getPersonalizedFeedPolicyBySection(
  sectionKey: PersonalizedSectionKey
): PersonalizedFeedPolicy | undefined {
  return POLICIES.find((p) => p.sectionKey === sectionKey);
}

export function getPersonalizedFeedPolicyById(
  id: string
): PersonalizedFeedPolicy | undefined {
  return POLICIES.find((p) => p.id === id);
}

export function savePersonalizedFeedPolicy(
  input: Omit<PersonalizedFeedPolicy, "createdAt" | "updatedAt"> & {
    createdAt?: string;
    updatedAt?: string;
  }
): PersonalizedFeedPolicy {
  const now = new Date().toISOString();
  const existing = POLICIES.find((p) => p.id === input.id);
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    return { ...existing };
  }
  const policy: PersonalizedFeedPolicy = { ...input, createdAt: now, updatedAt: now };
  POLICIES.push(policy);
  return { ...policy };
}

export const PERSONALIZED_SECTION_LABELS: Record<PersonalizedSectionKey, string> = {
  category_based: "카테고리별 추천",
  interest_based: "관심 카테고리 추천",
  recent_view_based: "최근 본 상품과 비슷해요",
  recent_favorite_based: "찜한 상품과 비슷해요",
  recent_chat_based: "최근 대화한 상품과 비슷해요",
};
