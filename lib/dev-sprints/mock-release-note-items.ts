/**
 * 52단계: 릴리즈 노트 항목 mock
 */

import type {
  ReleaseNoteItem,
  ReleaseNoteItemType,
} from "@/lib/types/dev-sprints";

const now = new Date().toISOString();

const ITEMS: ReleaseNoteItem[] = [
  {
    id: "rni-1",
    releaseNoteId: "rn-1",
    itemType: "feature",
    title: "신고 처리 결과 알림",
    description: "신고 접수·처리 시 푸시 알림 발송",
    linkedBacklogItemId: "pbi-5",
    linkedSprintItemId: "dsi-4",
    linkedQaIssueId: null,
    linkedDeploymentId: "dep-1",
    sortOrder: 1,
    createdAt: now,
  },
  {
    id: "rni-2",
    releaseNoteId: "rn-1",
    itemType: "improvement",
    title: "앱 안정성 개선",
    description: "일부 크래시 수정",
    linkedBacklogItemId: null,
    linkedSprintItemId: null,
    linkedQaIssueId: null,
    linkedDeploymentId: null,
    sortOrder: 2,
    createdAt: now,
  },
  {
    id: "rni-3",
    releaseNoteId: "rn-2",
    itemType: "bugfix",
    title: "피드 무한스크롤 깜빡임 수정",
    description: "스크롤 시 리스트 깜빡임 제거",
    linkedBacklogItemId: "pbi-1",
    linkedSprintItemId: "dsi-1",
    linkedQaIssueId: "qai-1",
    linkedDeploymentId: null,
    sortOrder: 1,
    createdAt: now,
  },
  {
    id: "rni-4",
    releaseNoteId: "rn-2",
    itemType: "feature",
    title: "채팅 알림 안정화",
    description: "FCM·권한 반영 개선",
    linkedBacklogItemId: "pbi-3",
    linkedSprintItemId: "dsi-2",
    linkedQaIssueId: null,
    linkedDeploymentId: null,
    sortOrder: 2,
    createdAt: now,
  },
];

export function getReleaseNoteItems(releaseNoteId: string): ReleaseNoteItem[] {
  return ITEMS.filter((i) => i.releaseNoteId === releaseNoteId).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}

export function getReleaseNoteItemById(id: string): ReleaseNoteItem | undefined {
  return ITEMS.find((i) => i.id === id);
}
