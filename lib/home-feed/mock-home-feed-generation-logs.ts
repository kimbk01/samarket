/**
 * 29단계: 홈 피드 생성 로그 mock
 */

import type { HomeFeedGenerationLog, HomeFeedSectionKey } from "@/lib/types/home-feed";

const LOGS: HomeFeedGenerationLog[] = [
  {
    id: "hfg-1",
    generatedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    userRegion: "마닐라 · Malate · Barangay 1",
    userId: "me",
    sectionKey: "recommended",
    candidateCount: 24,
    finalCount: 10,
    dedupedCount: 0,
    sponsoredIncluded: 2,
    note: "홈 피드 생성",
  },
  {
    id: "hfg-2",
    generatedAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    userRegion: "마닐라 · Malate · Barangay 1",
    userId: "me",
    sectionKey: "local_latest",
    candidateCount: 8,
    finalCount: 8,
    dedupedCount: 2,
    sponsoredIncluded: 0,
    note: "홈 피드 생성",
  },
];

export function getHomeFeedGenerationLogs(): HomeFeedGenerationLog[] {
  return [...LOGS].sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
  );
}

export function addHomeFeedGenerationLog(
  payload: Omit<HomeFeedGenerationLog, "id">
): HomeFeedGenerationLog {
  const log: HomeFeedGenerationLog = {
    ...payload,
    id: `hfg-${Date.now()}`,
  };
  LOGS.unshift(log);
  return log;
}
