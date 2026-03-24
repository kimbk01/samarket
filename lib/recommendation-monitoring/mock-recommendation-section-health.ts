/**
 * 35단계: 섹션별 헬스 mock
 */

import type {
  RecommendationSectionHealth,
  HealthStatus,
} from "@/lib/types/recommendation-monitoring";
import type { RecommendationSurface } from "@/lib/types/recommendation";

const now = new Date().toISOString();

const SECTIONS: { surface: RecommendationSurface; sectionKey: string }[] = [];
(["home", "search", "shop"] as RecommendationSurface[]).forEach((surface) => {
  [
    "recommended",
    "local_latest",
    "bumped",
    "sponsored",
    "premium_shops",
    "recent_based",
  ].forEach((sectionKey) => {
    SECTIONS.push({ surface, sectionKey });
  });
});

const CACHE: RecommendationSectionHealth[] = SECTIONS.map((s, i) => ({
  id: `rsh-${s.surface}-${s.sectionKey}`,
  surface: s.surface,
  sectionKey: s.sectionKey,
  status: "healthy" as HealthStatus,
  impressionCount: 1000 + i * 100,
  clickCount: 40 + i * 5,
  ctr: 0.03 + i * 0.002,
  emptyRate: 0.01,
  dedupeDropRate: 0.05,
  updatedAt: now,
}));

export function getRecommendationSectionHealth(
  surface?: RecommendationSurface
): RecommendationSectionHealth[] {
  let list = [...CACHE];
  if (surface) list = list.filter((h) => h.surface === surface);
  return list;
}
