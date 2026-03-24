/**
 * 32단계: 피드 버전 mock (섹션 설정·점수 오버라이드)
 */

import type { FeedVersion } from "@/lib/types/recommendation-experiment";

const now = new Date().toISOString();

const VERSIONS: FeedVersion[] = [
  {
    id: "fv-control-home",
    versionKey: "home_v1_control",
    versionName: "홈 대조군 v1",
    surface: "home",
    isActive: true,
    sectionConfig: [
      { sectionKey: "recommended", isActive: true, maxItems: 10 },
      { sectionKey: "local_latest", isActive: true, maxItems: 12 },
      { sectionKey: "bumped", isActive: true, maxItems: 6 },
      { sectionKey: "sponsored", isActive: true, maxItems: 4 },
      { sectionKey: "premium_shops", isActive: true, maxItems: 6 },
      { sectionKey: "recent_based", isActive: true, maxItems: 6 },
    ],
    scoringOverrides: {},
    dedupeStrategy: "global",
    notes: "기본 홈 피드",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "fv-variant-a-home",
    versionKey: "home_v1_variant_a",
    versionName: "홈 실험군 A (추천 강화)",
    surface: "home",
    isActive: true,
    sectionConfig: [
      { sectionKey: "recommended", isActive: true, maxItems: 14 },
      { sectionKey: "local_latest", isActive: true, maxItems: 10 },
      { sectionKey: "bumped", isActive: true, maxItems: 4 },
      { sectionKey: "sponsored", isActive: true, maxItems: 4 },
      { sectionKey: "premium_shops", isActive: true, maxItems: 6 },
      { sectionKey: "recent_based", isActive: false, maxItems: 0 },
    ],
    scoringOverrides: {
      premiumBoostWeight: 12,
      businessBoostWeight: 6,
      bumpBoostWeight: 10,
    },
    dedupeStrategy: "global",
    notes: "추천 섹션 확대, recent_based off",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "fv-variant-b-home",
    versionKey: "home_v1_variant_b",
    versionName: "홈 실험군 B (광고 비중 축소)",
    surface: "home",
    isActive: true,
    sectionConfig: [
      { sectionKey: "recommended", isActive: true, maxItems: 10 },
      { sectionKey: "local_latest", isActive: true, maxItems: 14 },
      { sectionKey: "bumped", isActive: true, maxItems: 8 },
      { sectionKey: "sponsored", isActive: true, maxItems: 2 },
      { sectionKey: "premium_shops", isActive: true, maxItems: 6 },
      { sectionKey: "recent_based", isActive: true, maxItems: 6 },
    ],
    scoringOverrides: {
      adBoostWeight: 10,
      pointPromotionBoostWeight: 8,
    },
    dedupeStrategy: "per_section",
    notes: "sponsored 축소, local_latest 확대",
    createdAt: now,
    updatedAt: now,
  },
];

export function getFeedVersions(surface?: "home" | "search" | "shop"): FeedVersion[] {
  if (surface) return VERSIONS.filter((v) => v.surface === surface);
  return [...VERSIONS];
}

export function getFeedVersionById(id: string): FeedVersion | undefined {
  return VERSIONS.find((v) => v.id === id);
}

export function saveFeedVersion(
  input: Omit<FeedVersion, "createdAt" | "updatedAt"> & {
    createdAt?: string;
    updatedAt?: string;
  }
): FeedVersion {
  const now = new Date().toISOString();
  const existing = VERSIONS.find((v) => v.id === input.id);
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    return { ...existing };
  }
  const version: FeedVersion = { ...input, createdAt: now, updatedAt: now };
  VERSIONS.push(version);
  return { ...version };
}
