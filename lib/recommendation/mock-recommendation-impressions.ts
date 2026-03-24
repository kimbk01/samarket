/**
 * 31단계: 추천 노출/클릭/전환 추적
 */

import type {
  RecommendationImpression,
  RecommendationSurface,
  RecommendationCandidateType,
} from "@/lib/types/recommendation";

const IMPRESSIONS: RecommendationImpression[] = [
  {
    id: "ri-1",
    userId: "me",
    surface: "home",
    sectionKey: "recommended",
    candidateId: "1",
    candidateType: "product",
    impressionAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    clicked: true,
    clickedAt: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
    converted: true,
    convertedAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    reasonLabel: "추천",
    score: 12.5,
  },
  {
    id: "ri-2",
    userId: "me",
    surface: "home",
    sectionKey: "recent_view_based",
    candidateId: "3",
    candidateType: "product",
    impressionAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    clicked: true,
    clickedAt: new Date(Date.now() - 1000 * 60 * 59).toISOString(),
    converted: false,
    convertedAt: null,
    reasonLabel: "최근 본 상품과 비슷해요",
    score: 8.2,
  },
  {
    id: "ri-3",
    userId: "me",
    surface: "home",
    sectionKey: "local_latest",
    candidateId: "2",
    candidateType: "product",
    impressionAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    clicked: false,
    clickedAt: null,
    converted: false,
    convertedAt: null,
    reasonLabel: "우리동네 최신",
    score: 5,
  },
];

export interface RecordImpressionPayload {
  userId: string;
  surface: RecommendationSurface;
  sectionKey: string;
  candidateId: string;
  candidateType: RecommendationCandidateType;
  reasonLabel: string;
  score: number;
}

export function recordImpression(payload: RecordImpressionPayload): RecommendationImpression {
  const imp: RecommendationImpression = {
    id: `ri-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    userId: payload.userId,
    surface: payload.surface,
    sectionKey: payload.sectionKey,
    candidateId: payload.candidateId,
    candidateType: payload.candidateType,
    impressionAt: new Date().toISOString(),
    clicked: false,
    clickedAt: null,
    converted: false,
    convertedAt: null,
    reasonLabel: payload.reasonLabel,
    score: payload.score,
  };
  IMPRESSIONS.unshift(imp);
  return imp;
}

export function recordRecommendationClick(
  userId: string,
  sectionKey: string,
  candidateId: string
): void {
  const found = IMPRESSIONS.find(
    (i) =>
      i.userId === userId &&
      i.sectionKey === sectionKey &&
      i.candidateId === candidateId &&
      !i.clicked
  );
  if (found) {
    found.clicked = true;
    found.clickedAt = new Date().toISOString();
  }
}

export function recordRecommendationConversion(
  userId: string,
  sectionKey: string,
  candidateId: string
): void {
  const found = IMPRESSIONS.find(
    (i) =>
      i.userId === userId &&
      i.sectionKey === sectionKey &&
      i.candidateId === candidateId &&
      i.clicked &&
      !i.converted
  );
  if (found) {
    found.converted = true;
    found.convertedAt = new Date().toISOString();
  }
}

/** 전환 플레이스홀더: 찜 추가/채팅 시작 시 해당 상품의 최근 클릭 노출을 전환으로 표시 */
export function recordConversionByProduct(
  userId: string,
  productId: string
): void {
  const found = IMPRESSIONS.find(
    (i) =>
      i.userId === userId &&
      i.candidateId === productId &&
      i.clicked &&
      !i.converted
  );
  if (found) {
    found.converted = true;
    found.convertedAt = new Date().toISOString();
  }
}

export function getImpressions(userId?: string): RecommendationImpression[] {
  if (userId) return IMPRESSIONS.filter((i) => i.userId === userId);
  return [...IMPRESSIONS];
}
