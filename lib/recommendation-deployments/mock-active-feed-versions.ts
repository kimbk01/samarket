/**
 * 33단계: surface별 현재 live 버전 (피드 엔진 참조용)
 */

import type { ActiveFeedVersion } from "@/lib/types/recommendation-deployment";
import type { RecommendationSurface } from "@/lib/types/recommendation";

const ADMIN_ID = "admin1";
const ADMIN_NICKNAME = "관리자";

const ACTIVE: ActiveFeedVersion[] = [
  {
    id: "afv-home",
    surface: "home",
    liveVersionId: "fv-control-home",
    previousVersionId: null,
    rolloutPercent: 100,
    updatedAt: new Date().toISOString(),
    updatedByAdminId: ADMIN_ID,
    updatedByAdminNickname: ADMIN_NICKNAME,
  },
  {
    id: "afv-search",
    surface: "search",
    liveVersionId: "fv-control-home",
    previousVersionId: null,
    rolloutPercent: 100,
    updatedAt: new Date().toISOString(),
    updatedByAdminId: ADMIN_ID,
    updatedByAdminNickname: ADMIN_NICKNAME,
  },
  {
    id: "afv-shop",
    surface: "shop",
    liveVersionId: "fv-control-home",
    previousVersionId: null,
    rolloutPercent: 100,
    updatedAt: new Date().toISOString(),
    updatedByAdminId: ADMIN_ID,
    updatedByAdminNickname: ADMIN_NICKNAME,
  },
];

export function getActiveFeedVersions(): ActiveFeedVersion[] {
  return [...ACTIVE];
}

export function getActiveFeedVersionBySurface(
  surface: RecommendationSurface
): ActiveFeedVersion | undefined {
  return ACTIVE.find((a) => a.surface === surface);
}

/** 피드 엔진용: surface별 현재 운영 버전 ID (없으면 null → 기본 정책 사용) */
export function getLiveVersionId(
  surface: RecommendationSurface
): string | null {
  const a = ACTIVE.find((x) => x.surface === surface);
  return a?.liveVersionId ?? null;
}

export function setLiveVersion(
  surface: RecommendationSurface,
  versionId: string,
  adminId = ADMIN_ID,
  adminNickname = ADMIN_NICKNAME
): ActiveFeedVersion {
  const now = new Date().toISOString();
  const row = ACTIVE.find((a) => a.surface === surface);
  if (row) {
    row.previousVersionId = row.liveVersionId;
    row.liveVersionId = versionId;
    row.rolloutPercent = 100;
    row.updatedAt = now;
    row.updatedByAdminId = adminId;
    row.updatedByAdminNickname = adminNickname;
    return { ...row };
  }
  const newRow: ActiveFeedVersion = {
    id: `afv-${surface}-${Date.now()}`,
    surface,
    liveVersionId: versionId,
    previousVersionId: null,
    rolloutPercent: 100,
    updatedAt: now,
    updatedByAdminId: adminId,
    updatedByAdminNickname: adminNickname,
  };
  ACTIVE.push(newRow);
  return { ...newRow };
}

export function rollbackToPrevious(
  surface: RecommendationSurface,
  adminId = ADMIN_ID,
  adminNickname = ADMIN_NICKNAME
): ActiveFeedVersion | null {
  const row = ACTIVE.find((a) => a.surface === surface);
  if (!row?.previousVersionId) return null;
  const now = new Date().toISOString();
  row.liveVersionId = row.previousVersionId;
  row.previousVersionId = null;
  row.updatedAt = now;
  row.updatedByAdminId = adminId;
  row.updatedByAdminNickname = adminNickname;
  return { ...row };
}
