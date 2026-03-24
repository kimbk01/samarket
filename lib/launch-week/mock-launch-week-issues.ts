/**
 * 49단계: 오픈 직후 긴급 이슈 mock (35 incident, 48 qa_issue, 38 action_item 연계)
 */

import type {
  LaunchWeekIssue,
  LaunchWeekDayNumber,
  LaunchWeekIssueStatus,
} from "@/lib/types/launch-week";

const now = new Date().toISOString();

const ISSUES: LaunchWeekIssue[] = [
  {
    id: "lwi-1",
    title: "이미지 업로드 500 에러",
    category: "image_upload",
    severity: "critical",
    status: "investigating",
    linkedType: "qa_issue",
    linkedId: "qil-1",
    dayNumber: 1,
    openedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    resolvedAt: null,
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    note: "스토리지 정책 점검 중",
  },
  {
    id: "lwi-2",
    title: "채팅 API 지연",
    category: "chat",
    severity: "high",
    status: "open",
    linkedType: "incident",
    linkedId: "inc-1",
    dayNumber: 2,
    openedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    resolvedAt: null,
    ownerAdminId: null,
    ownerAdminNickname: null,
    note: "",
  },
  {
    id: "lwi-3",
    title: "피드 fallback 1회 발생",
    category: "recommendation",
    severity: "medium",
    status: "mitigated",
    linkedType: "alert_event",
    linkedId: null,
    dayNumber: 2,
    openedAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    resolvedAt: now,
    ownerAdminId: null,
    ownerAdminNickname: null,
    note: "자동 복구됨",
  },
  {
    id: "lwi-4",
    title: "관리자 메뉴 권한 표시 오류",
    category: "admin_ops",
    severity: "low",
    status: "resolved",
    linkedType: "qa_issue",
    linkedId: "qil-3",
    dayNumber: 1,
    openedAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    resolvedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    ownerAdminId: null,
    ownerAdminNickname: null,
    note: "",
  },
];

export function getLaunchWeekIssues(filters?: {
  dayNumber?: LaunchWeekDayNumber;
  status?: LaunchWeekIssueStatus;
  severity?: string;
}): LaunchWeekIssue[] {
  let list = [...ISSUES].sort(
    (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime()
  );
  if (filters?.dayNumber)
    list = list.filter((i) => i.dayNumber === filters.dayNumber);
  if (filters?.status)
    list = list.filter((i) => i.status === filters.status);
  if (filters?.severity)
    list = list.filter((i) => i.severity === filters.severity);
  return list;
}

export function getOpenCriticalIssues(): LaunchWeekIssue[] {
  return ISSUES.filter(
    (i) =>
      i.severity === "critical" &&
      !["resolved", "mitigated"].includes(i.status)
  );
}
