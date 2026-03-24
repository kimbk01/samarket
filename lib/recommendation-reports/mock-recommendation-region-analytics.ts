/**
 * 37단계: 지역별 성과 분석 mock
 */

import type { RecommendationRegionAnalytics } from "@/lib/types/recommendation-report";

const REGIONS: RecommendationRegionAnalytics[] = [];

const DEFAULT_REGIONS: { region: string; city: string; barangay: string | null }[] = [
  { region: "서울", city: "강남구", barangay: null },
  { region: "서울", city: "서초구", barangay: null },
  { region: "경기", city: "성남시", barangay: null },
  { region: "인천", city: "남동구", barangay: null },
];

export function getRecommendationRegionAnalytics(
  reportId: string
): RecommendationRegionAnalytics[] {
  const list = REGIONS.filter((r) => r.reportId === reportId);
  if (list.length > 0) return list;
  const out: RecommendationRegionAnalytics[] = DEFAULT_REGIONS.map((r, i) => {
    const impressionCount = 10000 + i * 5000;
    const clickCount = Math.floor(impressionCount * 0.038);
    const conversionCount = Math.floor(clickCount * 0.1);
    const row: RecommendationRegionAnalytics = {
      id: `rrg-${reportId}-${i}`,
      reportId,
      region: r.region,
      city: r.city,
      barangay: r.barangay,
      impressionCount,
      clickCount,
      ctr: 0.038,
      conversionCount,
      conversionRate: impressionCount > 0 ? conversionCount / impressionCount : 0,
    };
    REGIONS.push(row);
    return row;
  });
  return out;
}
