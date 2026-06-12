import type { HomeFeedPolicy } from "@/lib/types/home-feed";
import { SECTION_LABELS } from "@/lib/home-feed/home-feed-labels";

export function createDefaultHomeFeedPolicies(): HomeFeedPolicy[] {
  const now = new Date().toISOString();
  const base = (sectionKey: HomeFeedPolicy["sectionKey"], priorityOrder: number, partial: Partial<HomeFeedPolicy>): HomeFeedPolicy => ({
    id: `hfp-${sectionKey}`,
    sectionKey,
    sectionLabel: SECTION_LABELS[sectionKey],
    isActive: true,
    sortMode: "featured",
    maxItems: 10,
    allowSponsoredMix: false,
    allowPremiumBoost: false,
    allowBusinessBoost: true,
    allowPointPromotionBoost: false,
    dedupeEnabled: true,
    regionScope: "region",
    priorityOrder,
    createdAt: now,
    updatedAt: now,
    ...partial,
  });

  return [
    base("recommended", 1, {
      sortMode: "featured",
      allowSponsoredMix: true,
      allowPremiumBoost: true,
      allowPointPromotionBoost: true,
      adminMemo: "노출 점수 기반 추천",
    }),
    base("local_latest", 2, {
      sortMode: "latest",
      maxItems: 12,
      regionScope: "barangay",
      adminMemo: "동네 최신순",
    }),
    base("bumped", 3, { sortMode: "latest", maxItems: 6, adminMemo: "끌올 기준" }),
    base("sponsored", 4, {
      sortMode: "mixed",
      maxItems: 4,
      allowSponsoredMix: true,
      allowPointPromotionBoost: true,
      dedupeEnabled: false,
      adminMemo: "광고·포인트 노출",
    }),
    base("premium_shops", 5, {
      maxItems: 6,
      allowPremiumBoost: true,
      adminMemo: "프리미엄·상점 featured",
    }),
    base("recent_based", 6, { maxItems: 6, adminMemo: "최근 본 상품 기반" }),
  ];
}
