/**
 * 53단계: 회귀 이슈 mock (52 release, 48 QA, 51 backlog, hotfix 연동)
 */

import type {
  ReleaseRegressionIssue,
  RegressionIssueStatus,
  RegressionCategory,
} from "@/lib/types/release-archive";

const now = new Date().toISOString();

const ISSUES: ReleaseRegressionIssue[] = [
  {
    id: "rri-1",
    releaseArchiveId: "ra-2",
    title: "채팅 알림 미수신 회귀",
    description: "1.3.0 배포 후 일부 기기에서 채팅 알림 미수신",
    severity: "high",
    status: "investigating" as RegressionIssueStatus,
    detectedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    fixedAt: null,
    verifiedAt: null,
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    linkedQaIssueId: null,
    linkedBacklogItemId: null,
    linkedHotfixReleaseId: null,
    regressionCategory: "chat" as RegressionCategory,
    note: "",
  },
  {
    id: "rri-2",
    releaseArchiveId: "ra-1",
    title: "피드 로딩 지연",
    description: "1.2.0 배포 직후 피드 첫 로딩 2초 이상",
    severity: "medium",
    status: "verified",
    detectedAt: new Date(Date.now() - 12 * 86400000).toISOString(),
    fixedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    verifiedAt: new Date(Date.now() - 9 * 86400000).toISOString(),
    ownerAdminId: null,
    ownerAdminNickname: null,
    linkedQaIssueId: "qai-2",
    linkedBacklogItemId: null,
    linkedHotfixReleaseId: null,
    regressionCategory: "feed",
    note: "",
  },
  {
    id: "rri-3",
    releaseArchiveId: "ra-3",
    title: "로그인 실패 회귀 (반복 패턴)",
    description: "1.1.0에서 인증 플로우 회귀 다수 보고",
    severity: "critical",
    status: "archived",
    detectedAt: new Date(Date.now() - 46 * 86400000).toISOString(),
    fixedAt: null,
    verifiedAt: null,
    ownerAdminId: null,
    ownerAdminNickname: null,
    linkedQaIssueId: null,
    linkedBacklogItemId: null,
    linkedHotfixReleaseId: "ra-1",
    regressionCategory: "auth",
    note: "롤백으로 해결",
  },
];

export function getReleaseRegressionIssues(filters?: {
  releaseArchiveId?: string;
  status?: RegressionIssueStatus;
  severity?: ReleaseRegressionIssue["severity"];
  regressionCategory?: RegressionCategory;
}): ReleaseRegressionIssue[] {
  let list = [...ISSUES].sort(
    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()
  );
  if (filters?.releaseArchiveId)
    list = list.filter((i) => i.releaseArchiveId === filters.releaseArchiveId);
  if (filters?.status)
    list = list.filter((i) => i.status === filters.status);
  if (filters?.severity)
    list = list.filter((i) => i.severity === filters.severity);
  if (filters?.regressionCategory)
    list = list.filter((i) => i.regressionCategory === filters.regressionCategory);
  return list;
}

export function getRegressionIssuesByRelease(
  releaseArchiveId: string
): ReleaseRegressionIssue[] {
  return getReleaseRegressionIssues({ releaseArchiveId });
}
