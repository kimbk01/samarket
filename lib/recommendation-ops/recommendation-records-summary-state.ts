/**
 * 추천 기록 요약 스냅샷 — 서버 집계 RPC 결과(건수만)를 화면 동기 계산(요약 카드·보고서 KPI·자동화 평가·실험 성과)에 제공.
 * 기록 행은 담지 않는다 (예전 메모리 링버퍼 MAX_* 제거 — 목록은 서버 페이지로 읽는다).
 * 시작값 = 0건 (코드 속 예시 기록으로 채우지 않는다). 로드 = recommendation-records-client.loadRecommendationRecordsSummaryFromServer.
 */
import type { RecommendationAnalyticsSummary, RecommendationSurface } from "@/lib/types/recommendation";
import {
  emptyRecommendationRecordsSummary,
  recommendationExperimentGroupKey,
  type RecommendationImpressionGroupSummary,
  type RecommendationRecordsSummary,
} from "@/lib/recommendation-ops/recommendation-records-contract";

let SUMMARY: RecommendationRecordsSummary = emptyRecommendationRecordsSummary();

export function setRecommendationRecordsSummary(next: RecommendationRecordsSummary): void {
  SUMMARY = next;
}

export function getRecommendationRecordsSummary(): RecommendationRecordsSummary {
  return SUMMARY;
}

/** 자동화 평가용 — surface 별 열린 critical 이슈 수 · 미해결 배포 실패 이슈 수. */
export function getRecommendationIncidentCountsBySurface(surface: RecommendationSurface): {
  criticalOpen: number;
  deploymentFailureUnresolved: number;
} {
  return SUMMARY.incidents.bySurface[surface];
}

/** 노출 기록 → surface·섹션별 성과 요약 (예전 buildAnalyticsSummaryFromImpressions 와 같은 계산, 집계는 DB). */
export function getRecommendationAnalyticsSummaryFromRecords(): RecommendationAnalyticsSummary[] {
  const now = new Date().toISOString();
  return SUMMARY.impressions.sections
    .map((s) => ({
      id: `ras-${s.surface}:${s.sectionKey}`,
      surface: s.surface,
      sectionKey: s.sectionKey,
      impressionCount: s.impressionCount,
      clickCount: s.clickCount,
      conversionCount: s.conversionCount,
      ctr: s.impressionCount > 0 ? s.clickCount / s.impressionCount : 0,
      conversionRate: s.clickCount > 0 ? s.conversionCount / s.clickCount : 0,
      avgScore: s.impressionCount > 0 ? Math.round((s.scoreSum / s.impressionCount) * 100) / 100 : 0,
      topReason: s.topReason,
      updatedAt: now,
    }))
    .sort((a, b) => b.impressionCount - a.impressionCount);
}

const EMPTY_GROUP: Omit<RecommendationImpressionGroupSummary, "key"> = {
  impressionCount: 0,
  clickCount: 0,
  conversionCount: 0,
  scoreSum: 0,
};

/** 실험·버전 배정 회원의 노출 집계 (서버가 DB 실험 번들의 배정으로 계산). 없으면 0건. */
export function getRecommendationExperimentGroupStats(
  experimentId: string,
  versionId: string
): Omit<RecommendationImpressionGroupSummary, "key"> {
  const key = recommendationExperimentGroupKey(experimentId, versionId);
  const g = SUMMARY.userGroups.find((x) => x.key === key);
  return g ? { ...g } : { ...EMPTY_GROUP };
}
