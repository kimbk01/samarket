/**
 * 52단계: 스프린트 작업 mock (51 backlog, 48 QA, 33 deployment, 38 action 연계)
 */

import type {
  DevSprintItem,
  DevSprintItemStatus,
} from "@/lib/types/dev-sprints";

const now = new Date().toISOString();

const ITEMS: DevSprintItem[] = [
  {
    id: "dsi-1",
    sprintId: "ds-1",
    backlogItemId: "pbi-1",
    title: "피드 무한스크롤 깜빡임 개선",
    description: "스크롤 시 리스트 깜빡임 제거",
    status: "in_progress",
    priority: "high",
    ownerType: "dev",
    ownerName: "개발 placeholder",
    linkedQaIssueId: "qai-1",
    linkedActionItemId: null,
    linkedDeploymentId: null,
    estimatePoint: 5,
    completedAt: null,
    blockerReason: null,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    updatedAt: now,
  },
  {
    id: "dsi-2",
    sprintId: "ds-1",
    backlogItemId: "pbi-3",
    title: "채팅 알림 수신 안정화",
    description: "알림 설정 반영 및 FCM 검증",
    status: "blocked",
    priority: "critical",
    ownerType: "shared",
    ownerName: "개발 placeholder",
    linkedQaIssueId: null,
    linkedActionItemId: null,
    linkedDeploymentId: null,
    estimatePoint: 8,
    completedAt: null,
    blockerReason: "FCM 토큰 갱신 이슈 확인 중",
    createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    updatedAt: now,
  },
  {
    id: "dsi-3",
    sprintId: "ds-1",
    backlogItemId: "pbi-2",
    title: "상품 사진 업로드 성능 개선",
    description: "이미지 업로드 대기 시간 단축",
    status: "todo",
    priority: "high",
    ownerType: "dev",
    ownerName: "개발 placeholder",
    linkedQaIssueId: null,
    linkedActionItemId: null,
    linkedDeploymentId: null,
    estimatePoint: 5,
    completedAt: null,
    blockerReason: null,
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: now,
  },
  {
    id: "dsi-4",
    sprintId: "ds-2",
    backlogItemId: "pbi-5",
    title: "신고 처리 결과 알림",
    description: "신고 접수/처리 결과 푸시 알림",
    status: "done",
    priority: "high",
    ownerType: "dev",
    ownerName: "개발 placeholder",
    linkedQaIssueId: null,
    linkedActionItemId: "act-1",
    linkedDeploymentId: "dep-1",
    estimatePoint: 4,
    completedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    blockerReason: null,
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    updatedAt: now,
  },
];

export function getDevSprintItems(filters?: {
  sprintId?: string;
  status?: DevSprintItemStatus;
}): DevSprintItem[] {
  let list = [...ITEMS].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  if (filters?.sprintId) list = list.filter((i) => i.sprintId === filters.sprintId);
  if (filters?.status) list = list.filter((i) => i.status === filters.status);
  return list;
}

export function getDevSprintItemById(id: string): DevSprintItem | undefined {
  return ITEMS.find((i) => i.id === id);
}
