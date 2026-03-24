/**
 * 31단계: 추천 분석 요약 계산
 */

import type {
  RecommendationImpression,
  RecommendationAnalyticsSummary,
} from "@/lib/types/recommendation";

export function buildAnalyticsSummaryFromImpressions(
  impressions: RecommendationImpression[]
): RecommendationAnalyticsSummary[] {
  const byKey = new Map<string, RecommendationImpression[]>();
  for (const i of impressions) {
    const key = `${i.surface}:${i.sectionKey}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(i);
  }
  const now = new Date().toISOString();
  const result: RecommendationAnalyticsSummary[] = [];
  for (const [key, list] of byKey) {
    const parts = key.split(":");
    const surface = parts[0] as RecommendationImpression["surface"];
    const sectionKey = parts.slice(1).join(":") || "";
    const impressionCount = list.length;
    const clickCount = list.filter((i) => i.clicked).length;
    const conversionCount = list.filter((i) => i.converted).length;
    const ctr = impressionCount > 0 ? clickCount / impressionCount : 0;
    const conversionRate = clickCount > 0 ? conversionCount / clickCount : 0;
    const avgScore =
      list.length > 0
        ? list.reduce((s, i) => s + i.score, 0) / list.length
        : 0;
    const reasonCounts = new Map<string, number>();
    for (const i of list) {
      const r = i.reasonLabel || "-";
      reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
    }
    const topReason =
      [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
    result.push({
      id: `ras-${key}`,
      surface,
      sectionKey,
      impressionCount,
      clickCount,
      conversionCount,
      ctr,
      conversionRate,
      avgScore: Math.round(avgScore * 100) / 100,
      topReason,
      updatedAt: now,
    });
  }
  return result.sort((a, b) => b.impressionCount - a.impressionCount);
}
