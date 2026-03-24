/**
 * 34단계: 섹션 긴급 비활성화 오버라이드 mock
 */

import type {
  FeedSectionOverride,
  FeedSectionOverrideKey,
} from "@/lib/types/feed-emergency";
import type { RecommendationSurface } from "@/lib/types/recommendation";

const ADMIN_ID = "admin1";
const ADMIN_NICK = "관리자";
const now = new Date().toISOString();

const OVERRIDES: FeedSectionOverride[] = [];

export const SECTION_OVERRIDE_KEYS: FeedSectionOverrideKey[] = [
  "recommended",
  "local_latest",
  "bumped",
  "sponsored",
  "premium_shops",
  "recent_based",
  "category_based",
  "interest_based",
];

export const SECTION_OVERRIDE_LABELS: Record<FeedSectionOverrideKey, string> = {
  recommended: "추천",
  local_latest: "우리동네 최신",
  bumped: "끌올",
  sponsored: "광고/프로모션",
  premium_shops: "특별회원/상점",
  recent_based: "최근 본 기반",
  category_based: "카테고리 기반",
  interest_based: "관심 기반",
};

export function getFeedSectionOverrides(
  surface?: RecommendationSurface
): FeedSectionOverride[] {
  if (surface) return OVERRIDES.filter((o) => o.surface === surface);
  return [...OVERRIDES];
}

export function getFeedSectionOverride(
  surface: RecommendationSurface,
  sectionKey: FeedSectionOverrideKey
): FeedSectionOverride | undefined {
  return OVERRIDES.find(
    (o) => o.surface === surface && o.sectionKey === sectionKey
  );
}

export function setFeedSectionOverride(
  surface: RecommendationSurface,
  sectionKey: FeedSectionOverrideKey,
  isForcedDisabled: boolean,
  reason: string,
  adminId = ADMIN_ID,
  adminNickname = ADMIN_NICK
): FeedSectionOverride {
  const now = new Date().toISOString();
  const existing = OVERRIDES.find(
    (o) => o.surface === surface && o.sectionKey === sectionKey
  );
  if (existing) {
    existing.isForcedDisabled = isForcedDisabled;
    existing.reason = reason;
    existing.updatedAt = now;
    existing.updatedByAdminId = adminId;
    existing.updatedByAdminNickname = adminNickname;
    return { ...existing };
  }
  const row: FeedSectionOverride = {
    id: `fso-${surface}-${sectionKey}-${Date.now()}`,
    surface,
    sectionKey,
    isForcedDisabled,
    reason,
    updatedAt: now,
    updatedByAdminId: adminId,
    updatedByAdminNickname: adminNickname,
  };
  OVERRIDES.push(row);
  return row;
}

export function removeFeedSectionOverride(
  surface: RecommendationSurface,
  sectionKey: FeedSectionOverrideKey
): boolean {
  const i = OVERRIDES.findIndex(
    (o) => o.surface === surface && o.sectionKey === sectionKey
  );
  if (i === -1) return false;
  OVERRIDES.splice(i, 1);
  return true;
}
