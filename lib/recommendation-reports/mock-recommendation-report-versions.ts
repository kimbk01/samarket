/**
 * 37단계: 보고서 버전별 성과 mock
 */

import type { RecommendationReportVersion } from "@/lib/types/recommendation-report";
import type { RecommendationSurface } from "@/lib/types/recommendation";

const VERSIONS: RecommendationReportVersion[] = [];

export function getRecommendationReportVersions(
  reportId: string
): RecommendationReportVersion[] {
  const list = VERSIONS.filter((v) => v.reportId === reportId);
  if (list.length > 0) return list;
  const surfaces: RecommendationSurface[] = ["home", "search", "shop"];
  const out: RecommendationReportVersion[] = [];
  surfaces.forEach((surface, i) => {
    out.push({
      id: `rrv-${reportId}-${surface}-control`,
      reportId,
      versionId: "fv-control-home",
      surface,
      impressionCount: 40000 + i * 5000,
      clickCount: 1600 + i * 200,
      ctr: 0.04,
      conversionCount: 320 + i * 40,
      conversionRate: 0.008,
      deploymentStatus: "success",
      isLiveVersion: true,
    });
    out.push({
      id: `rrv-${reportId}-${surface}-variant`,
      reportId,
      versionId: "fv-variant-a-home",
      surface,
      impressionCount: 12000 + i * 2000,
      clickCount: 520 + i * 80,
      ctr: 0.043,
      conversionCount: 96 + i * 12,
      conversionRate: 0.008,
      deploymentStatus: "success",
      isLiveVersion: false,
    });
  });
  out.forEach((v) => VERSIONS.push(v));
  return out;
}

export function setRecommendationReportVersions(
  reportId: string,
  versions: Omit<RecommendationReportVersion, "id" | "reportId">[]
): void {
  const toRemove = VERSIONS.filter((v) => v.reportId === reportId);
  toRemove.forEach((v) => {
    const i = VERSIONS.indexOf(v);
    if (i !== -1) VERSIONS.splice(i, 1);
  });
  versions.forEach((v, idx) => {
    VERSIONS.push({
      ...v,
      id: `rrv-${reportId}-${idx}`,
      reportId,
    });
  });
}
