/**
 * 28단계: 노출 점수 계산 유틸 (가중치 적용·정렬)
 */

import type {
  ExposureScorePolicy,
  ExposureCandidate,
  ExposureScoreResult,
  ExposureSurface,
} from "@/lib/types/exposure";

export interface UserRegionContext {
  region: string;
  city: string;
  barangay: string;
}

/** 최신성 점수 (0~1, 최신일수록 높음) */
function baseLatestScore(createdAt: string): number {
  const days = (Date.now() - new Date(createdAt).getTime()) / 86400000;
  return Math.max(0, 1 - days / 365);
}

/** 인기도 점수 (0~1 정규화, likes+chat+view) */
function basePopularScore(
  likesCount: number,
  chatCount: number,
  viewCount: number
): number {
  const raw = likesCount * 2 + chatCount * 1.5 + Math.min(viewCount / 10, 20);
  return Math.min(1, raw / 50);
}

/** 거리 점수 (가까울수록 높음, 0~1) */
function baseNearbyScore(distance: number): number {
  if (distance >= 999) return 0;
  return Math.max(0, 1 - distance / 10);
}

/** 끌올 보너스 (24시간 이내면 1) */
function bumpBoostScore(bumpedAt: string | null): number {
  if (!bumpedAt) return 0;
  const hours = (Date.now() - new Date(bumpedAt).getTime()) / 3600000;
  return hours <= 24 ? 1 : 0;
}

/** 지역 일치 점수 (exact > same city > same region) */
function regionMatchScore(
  candidate: ExposureCandidate,
  userRegion: UserRegionContext | null,
  policy: ExposureScorePolicy
): number {
  if (!userRegion?.region) return 0;
  const r = candidate.region?.trim();
  const c = candidate.city?.trim();
  const b = candidate.barangay?.trim();
  const ur = userRegion.region?.trim();
  const uc = userRegion.city?.trim();
  const ub = userRegion.barangay?.trim();
  if (r === ur && c === uc && b === ub) return 1;
  if (r === ur && c === uc) return 0.6;
  if (r === ur) return 0.3;
  return 0;
}

export function computeExposureScore(
  candidate: ExposureCandidate,
  policy: ExposureScorePolicy,
  surface: ExposureSurface,
  userRegion: UserRegionContext | null
): ExposureScoreResult {
  const reasons: string[] = [];
  const baseLatest = baseLatestScore(candidate.createdAt);
  const basePopular = basePopularScore(
    candidate.likesCount,
    candidate.chatCount,
    candidate.viewCount
  );
  const baseNearby = baseNearbyScore(candidate.distance);

  const premiumBoost =
    candidate.memberType === "premium" ? 1 : 0;
  if (premiumBoost) reasons.push("특별회원");

  const businessBoost = candidate.isBusinessItem ? 1 : 0;
  if (businessBoost) reasons.push("상점상품");

  const adBoost = candidate.adPromotionStatus === "active" ? 1 : 0;
  if (adBoost) reasons.push("광고노출");

  const pointBoost = candidate.pointPromotionStatus === "active" ? 1 : 0;
  if (pointBoost) reasons.push("포인트노출");

  const bumpBoost = bumpBoostScore(candidate.bumpedAt);
  if (bumpBoost) reasons.push("끌올");

  const regionMatch = regionMatchScore(candidate, userRegion, policy);
  if (regionMatch > 0) reasons.push("지역일치");

  const finalScore =
    baseLatest * policy.latestWeight +
    basePopular * policy.popularWeight +
    baseNearby * policy.nearbyWeight +
    premiumBoost * policy.premiumBoostWeight +
    businessBoost * policy.businessBoostWeight +
    adBoost * policy.adBoostWeight +
    pointBoost * policy.pointPromotionBoostWeight +
    bumpBoost * policy.bumpBoostWeight +
    regionMatch *
      (policy.exactRegionMatchWeight * 1 +
        policy.sameCityWeight * 0.6 +
        policy.sameBarangayWeight * 0.3);

  return {
    candidateId: candidate.id,
    surface,
    baseLatestScore: baseLatest,
    basePopularScore: basePopular,
    baseNearbyScore: baseNearby,
    premiumBoostScore: premiumBoost * policy.premiumBoostWeight,
    businessBoostScore: businessBoost * policy.businessBoostWeight,
    adBoostScore: adBoost * policy.adBoostWeight,
    pointPromotionBoostScore: pointBoost * policy.pointPromotionBoostWeight,
    bumpBoostScore: bumpBoost * policy.bumpBoostWeight,
    regionMatchScore: regionMatch,
    finalScore: Math.round(finalScore * 100) / 100,
    appliedReasons: reasons,
    calculatedAt: new Date().toISOString(),
  };
}

export function computeAndSortCandidates(
  candidates: ExposureCandidate[],
  policy: ExposureScorePolicy,
  surface: ExposureSurface,
  userRegion: UserRegionContext | null
): { candidate: ExposureCandidate; result: ExposureScoreResult }[] {
  const withScores = candidates.map((c) => ({
    candidate: c,
    result: computeExposureScore(c, policy, surface, userRegion),
  }));
  withScores.sort((a, b) => b.result.finalScore - a.result.finalScore);
  return withScores;
}

export const SURFACE_LABELS: Record<ExposureSurface, string> = {
  home: "홈",
  search: "검색",
  shop_featured: "상점 featured",
};
