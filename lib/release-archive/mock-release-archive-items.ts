/**
 * 53단계: 릴리즈 변경 항목 mock (52 release note items, 51 backlog, 48 QA, 33 deployment 연동)
 */

import type {
  ReleaseArchiveItem,
  ReleaseArchiveChangeType,
} from "@/lib/types/release-archive";

const now = new Date().toISOString();

const ITEMS: ReleaseArchiveItem[] = [
  {
    id: "rai-1",
    releaseArchiveId: "ra-1",
    changeType: "feature",
    title: "신고 처리 결과 알림",
    description: "신고 접수·처리 시 푸시 알림",
    linkedBacklogItemId: "pbi-5",
    linkedSprintItemId: "dsi-4",
    linkedQaIssueId: null,
    linkedDeploymentId: "dep-1",
    linkedActionItemId: "act-1",
    sortOrder: 1,
    createdAt: now,
  },
  {
    id: "rai-2",
    releaseArchiveId: "ra-1",
    changeType: "improvement",
    title: "앱 안정성 개선",
    description: "일부 크래시 수정",
    linkedBacklogItemId: null,
    linkedSprintItemId: null,
    linkedQaIssueId: null,
    linkedDeploymentId: null,
    linkedActionItemId: null,
    sortOrder: 2,
    createdAt: now,
  },
  {
    id: "rai-3",
    releaseArchiveId: "ra-2",
    changeType: "bugfix",
    title: "피드 무한스크롤 깜빡임 수정",
    description: "스크롤 시 리스트 깜빡임 제거",
    linkedBacklogItemId: "pbi-1",
    linkedSprintItemId: "dsi-1",
    linkedQaIssueId: "qai-1",
    linkedDeploymentId: null,
    linkedActionItemId: null,
    sortOrder: 1,
    createdAt: now,
  },
  {
    id: "rai-4",
    releaseArchiveId: "ra-2",
    changeType: "feature",
    title: "채팅 알림 안정화",
    description: "FCM·권한 반영 개선",
    linkedBacklogItemId: "pbi-3",
    linkedSprintItemId: "dsi-2",
    linkedQaIssueId: null,
    linkedDeploymentId: null,
    linkedActionItemId: null,
    sortOrder: 2,
    createdAt: now,
  },
];

export function getReleaseArchiveItems(
  releaseArchiveId: string
): ReleaseArchiveItem[] {
  return ITEMS.filter((i) => i.releaseArchiveId === releaseArchiveId).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}

export function getAllReleaseArchiveItems(filters?: {
  releaseArchiveId?: string;
  changeType?: ReleaseArchiveChangeType;
}): ReleaseArchiveItem[] {
  let list = [...ITEMS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.releaseArchiveId)
    list = list.filter((i) => i.releaseArchiveId === filters.releaseArchiveId);
  if (filters?.changeType)
    list = list.filter((i) => i.changeType === filters.changeType);
  return list;
}
