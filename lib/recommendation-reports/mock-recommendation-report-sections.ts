/**
 * 37단계: 보고서 섹션별 성과 mock
 */

import type {
  RecommendationReportSection,
  SectionHealthStatus,
} from "@/lib/types/recommendation-report";
import type { RecommendationSurface } from "@/lib/types/recommendation";

const SECTIONS: RecommendationReportSection[] = [];

function makeSection(
  reportId: string,
  surface: RecommendationSurface,
  sectionKey: string,
  impressionCount: number,
  clickCount: number,
  conversionCount: number,
  avgScore: number,
  status: SectionHealthStatus
): RecommendationReportSection {
  return {
    id: `rrs-${reportId}-${surface}-${sectionKey}`,
    reportId,
    surface,
    sectionKey,
    impressionCount,
    clickCount,
    ctr: impressionCount > 0 ? clickCount / impressionCount : 0,
    conversionCount,
    conversionRate: impressionCount > 0 ? conversionCount / impressionCount : 0,
    avgScore,
    status,
  };
}

export function getRecommendationReportSections(
  reportId: string
): RecommendationReportSection[] {
  const list = SECTIONS.filter((s) => s.reportId === reportId);
  if (list.length > 0) return list;
  const surfaces: RecommendationSurface[] = ["home", "search", "shop"];
  const sectionKeys = ["recommended", "local_latest", "bumped", "sponsored"];
  const out: RecommendationReportSection[] = [];
  for (const surface of surfaces) {
    for (const sectionKey of sectionKeys) {
      out.push(
        makeSection(
          reportId,
          surface,
          sectionKey,
          10000 + Math.floor(Math.random() * 20000),
          400 + Math.floor(Math.random() * 800),
          80 + Math.floor(Math.random() * 120),
          0.65 + Math.random() * 0.2,
          "healthy"
        )
      );
    }
  }
  out.forEach((s) => SECTIONS.push(s));
  return out;
}

export function setRecommendationReportSections(
  reportId: string,
  sections: Omit<RecommendationReportSection, "id" | "reportId">[]
): void {
  const toRemove = SECTIONS.filter((s) => s.reportId === reportId);
  toRemove.forEach((s) => {
    const i = SECTIONS.indexOf(s);
    if (i !== -1) SECTIONS.splice(i, 1);
  });
  sections.forEach((s) => {
    SECTIONS.push({
      ...s,
      id: `rrs-${reportId}-${s.surface}-${s.sectionKey}`,
      reportId,
    });
  });
}
