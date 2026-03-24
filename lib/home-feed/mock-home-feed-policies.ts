/**
 * 29단계: 홈 피드 정책 mock
 */

import type {
  HomeFeedPolicy,
  HomeFeedSectionKey,
  HomeFeedSortMode,
  HomeFeedRegionScope,
} from "@/lib/types/home-feed";

const now = new Date().toISOString();

const POLICIES: HomeFeedPolicy[] = [
  {
    id: "hfp-recommended",
    sectionKey: "recommended",
    sectionLabel: "추천 상품",
    isActive: true,
    sortMode: "featured",
    maxItems: 10,
    allowSponsoredMix: true,
    allowPremiumBoost: true,
    allowBusinessBoost: true,
    allowPointPromotionBoost: true,
    dedupeEnabled: true,
    regionScope: "region",
    priorityOrder: 1,
    createdAt: now,
    updatedAt: now,
    adminMemo: "노출 점수 기반 추천",
  },
  {
    id: "hfp-local",
    sectionKey: "local_latest",
    sectionLabel: "우리동네 최신",
    isActive: true,
    sortMode: "latest",
    maxItems: 12,
    allowSponsoredMix: false,
    allowPremiumBoost: false,
    allowBusinessBoost: true,
    allowPointPromotionBoost: false,
    dedupeEnabled: true,
    regionScope: "barangay",
    priorityOrder: 2,
    createdAt: now,
    updatedAt: now,
    adminMemo: "동네 최신순",
  },
  {
    id: "hfp-bumped",
    sectionKey: "bumped",
    sectionLabel: "끌올 상품",
    isActive: true,
    sortMode: "latest",
    maxItems: 6,
    allowSponsoredMix: false,
    allowPremiumBoost: false,
    allowBusinessBoost: true,
    allowPointPromotionBoost: false,
    dedupeEnabled: true,
    regionScope: "region",
    priorityOrder: 3,
    createdAt: now,
    updatedAt: now,
    adminMemo: "끌올 기준",
  },
  {
    id: "hfp-sponsored",
    sectionKey: "sponsored",
    sectionLabel: "광고/프로모션",
    isActive: true,
    sortMode: "mixed",
    maxItems: 4,
    allowSponsoredMix: true,
    allowPremiumBoost: false,
    allowBusinessBoost: true,
    allowPointPromotionBoost: true,
    dedupeEnabled: false,
    regionScope: "region",
    priorityOrder: 4,
    createdAt: now,
    updatedAt: now,
    adminMemo: "광고·포인트 노출",
  },
  {
    id: "hfp-premium",
    sectionKey: "premium_shops",
    sectionLabel: "특별회원/상점 추천",
    isActive: true,
    sortMode: "featured",
    maxItems: 6,
    allowSponsoredMix: false,
    allowPremiumBoost: true,
    allowBusinessBoost: true,
    allowPointPromotionBoost: false,
    dedupeEnabled: true,
    regionScope: "region",
    priorityOrder: 5,
    createdAt: now,
    updatedAt: now,
    adminMemo: "프리미엄·상점 featured",
  },
  {
    id: "hfp-recent",
    sectionKey: "recent_based",
    sectionLabel: "최근 본 상품 기반 추천",
    isActive: true,
    sortMode: "featured",
    maxItems: 6,
    allowSponsoredMix: false,
    allowPremiumBoost: false,
    allowBusinessBoost: true,
    allowPointPromotionBoost: false,
    dedupeEnabled: true,
    regionScope: "region",
    priorityOrder: 6,
    createdAt: now,
    updatedAt: now,
    adminMemo: "placeholder",
  },
];

export function getHomeFeedPolicies(): HomeFeedPolicy[] {
  return [...POLICIES].sort((a, b) => a.priorityOrder - b.priorityOrder);
}

export function getHomeFeedPolicyBySection(
  sectionKey: HomeFeedSectionKey
): HomeFeedPolicy | undefined {
  return POLICIES.find((p) => p.sectionKey === sectionKey);
}

export function getHomeFeedPolicyById(id: string): HomeFeedPolicy | undefined {
  return POLICIES.find((p) => p.id === id);
}

export function saveHomeFeedPolicy(
  input: Omit<HomeFeedPolicy, "createdAt" | "updatedAt"> & {
    createdAt?: string;
    updatedAt?: string;
  }
): HomeFeedPolicy {
  const now = new Date().toISOString();
  const existing = POLICIES.find((p) => p.id === input.id);
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    return { ...existing };
  }
  const policy: HomeFeedPolicy = {
    ...input,
    createdAt: now,
    updatedAt: now,
  };
  POLICIES.push(policy);
  return { ...policy };
}

export const SECTION_LABELS: Record<HomeFeedSectionKey, string> = {
  recommended: "추천 상품",
  local_latest: "우리동네 최신",
  bumped: "끌올 상품",
  sponsored: "광고/프로모션",
  premium_shops: "특별회원/상점 추천",
  recent_based: "최근 본 상품 기반 추천",
};

export const SORT_MODE_LABELS: Record<HomeFeedSortMode, string> = {
  featured: "추천순",
  latest: "최신순",
  nearby: "가까운순",
  popular: "인기순",
  mixed: "혼합",
};

export const REGION_SCOPE_LABELS: Record<HomeFeedRegionScope, string> = {
  barangay: "바랑가이",
  city: "시/도시",
  region: "지역",
};
