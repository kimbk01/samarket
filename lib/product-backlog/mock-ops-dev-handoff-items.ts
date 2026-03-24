/**
 * 51단계: 운영-개발 handoff mock
 */

import type {
  OpsDevHandoffItem,
  OpsDevHandoffStatus,
} from "@/lib/types/product-backlog";

const now = new Date().toISOString();

const ITEMS: OpsDevHandoffItem[] = [
  {
    id: "odh-1",
    backlogItemId: "pbi-1",
    handoffStatus: "in_progress" as OpsDevHandoffStatus,
    opsSummary: "피드 깜빡임 QA 이슈와 동일. 재현 확실. 우선 처리 요청.",
    devNote: "가상화 리스트 키 이슈로 추정. 수정 중.",
    acceptanceCriteria: "스크롤 시 리스트가 비었다가 채워지는 현상 없음",
    requestedByAdminId: "admin1",
    requestedByAdminNickname: "관리자",
    assignedDevName: "개발팀 placeholder",
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    updatedAt: now,
  },
  {
    id: "odh-2",
    backlogItemId: "pbi-3",
    handoffStatus: "pending" as OpsDevHandoffStatus,
    opsSummary: "CS 문의 다수. 채팅 알림 미수신. FCM/권한 점검 요청.",
    devNote: "",
    acceptanceCriteria: "알림 설정 ON 시 채팅 메시지 도착 시 푸시 수신",
    requestedByAdminId: "admin1",
    requestedByAdminNickname: "관리자",
    assignedDevName: "",
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    updatedAt: now,
  },
];

export function getOpsDevHandoffItems(filters?: {
  handoffStatus?: OpsDevHandoffStatus;
  backlogItemId?: string;
}): OpsDevHandoffItem[] {
  let list = [...ITEMS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.handoffStatus)
    list = list.filter((h) => h.handoffStatus === filters.handoffStatus);
  if (filters?.backlogItemId)
    list = list.filter((h) => h.backlogItemId === filters.backlogItemId);
  return list;
}

export function getOpsDevHandoffByBacklogId(
  backlogItemId: string
): OpsDevHandoffItem | undefined {
  return ITEMS.find((h) => h.backlogItemId === backlogItemId);
}
