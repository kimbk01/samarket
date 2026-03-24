/**
 * 30단계: 개인화 피드 생성 로그 mock
 */

import type { PersonalizedFeedLog, PersonalizedSectionKey } from "@/lib/types/personalized-feed";

const LOGS: PersonalizedFeedLog[] = [
  {
    id: "pfl-1",
    userId: "me",
    sectionKey: "recent_view_based",
    candidateCount: 12,
    finalCount: 6,
    dedupedCount: 2,
    topReason: "최근 본 상품과 비슷해요",
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    note: "개인화 피드 생성",
  },
  {
    id: "pfl-2",
    userId: "me",
    sectionKey: "interest_based",
    candidateCount: 8,
    finalCount: 6,
    dedupedCount: 0,
    topReason: "자주 보는 카테고리예요",
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    note: "개인화 피드 생성",
  },
];

export function getPersonalizedFeedLogs(): PersonalizedFeedLog[] {
  return [...LOGS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function addPersonalizedFeedLog(
  payload: Omit<PersonalizedFeedLog, "id">
): PersonalizedFeedLog {
  const log: PersonalizedFeedLog = {
    ...payload,
    id: `pfl-${Date.now()}`,
  };
  LOGS.unshift(log);
  return log;
}
