/**
 * 48단계: QA 버그/이슈 로그 mock (failed 케이스 연계)
 */

import type {
  QaIssueLog,
  QaIssueStatus,
  QaIssueSeverity,
} from "@/lib/types/qa-board";

const now = new Date().toISOString();

const LOGS: QaIssueLog[] = [
  {
    id: "qil-1",
    title: "상품 이미지 업로드 500 에러",
    severity: "critical",
    status: "open",
    relatedTestCaseId: "qtc-3",
    linkedType: "product",
    linkedId: null,
    reproduced: true,
    createdAt: now,
    updatedAt: now,
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    note: "스토리지 bucket 정책 확인 필요",
  },
  {
    id: "qil-2",
    title: "채팅 메시지 지연",
    severity: "high",
    status: "in_progress",
    relatedTestCaseId: "qtc-5",
    linkedType: "chat",
    linkedId: null,
    reproduced: true,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: now,
    ownerAdminId: null,
    ownerAdminNickname: null,
    note: "",
  },
  {
    id: "qil-3",
    title: "관리자 메뉴 권한 표시 오류",
    severity: "medium",
    status: "fixed",
    relatedTestCaseId: null,
    linkedType: "admin",
    linkedId: null,
    reproduced: true,
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    updatedAt: now,
    ownerAdminId: null,
    ownerAdminNickname: null,
    note: "검증 대기",
  },
];

export function getQaIssueLogs(filters?: {
  status?: QaIssueStatus;
  severity?: QaIssueSeverity;
  relatedTestCaseId?: string;
}): QaIssueLog[] {
  let list = [...LOGS].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  if (filters?.status)
    list = list.filter((l) => l.status === filters.status);
  if (filters?.severity)
    list = list.filter((l) => l.severity === filters.severity);
  if (filters?.relatedTestCaseId)
    list = list.filter((l) => l.relatedTestCaseId === filters.relatedTestCaseId);
  return list;
}

export function getOpenCriticalIssues(): QaIssueLog[] {
  return LOGS.filter(
    (l) => l.severity === "critical" && !["fixed", "verified", "wont_fix"].includes(l.status)
  );
}
