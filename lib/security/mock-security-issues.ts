/**
 * 56단계: 보안 이슈 mock
 */

import type {
  SecurityIssue,
  SecurityIssueSeverity,
  SecurityIssueStatus,
} from "@/lib/types/security";

const ISSUES: SecurityIssue[] = [
  {
    id: "si-1",
    checkId: "sc-2",
    issueTitle: "users.email 노출 가능성",
    severity: "medium",
    status: "open",
    note: "일부 API에서 마스킹 필요",
  },
  {
    id: "si-2",
    checkId: "sc-4",
    issueTitle: "리프레시 토큰 TTL 과다",
    severity: "critical",
    status: "open",
    note: "90일 → 30일 권장",
  },
  {
    id: "si-3",
    checkId: "sc-1",
    issueTitle: "RLS 정책 누락 (이전)",
    severity: "high",
    status: "fixed",
    note: "배포로 해결",
  },
];

export function getSecurityIssues(filters?: {
  checkId?: string;
  status?: SecurityIssueStatus;
}): SecurityIssue[] {
  let list = [...ISSUES];
  if (filters?.checkId)
    list = list.filter((i) => i.checkId === filters.checkId);
  if (filters?.status)
    list = list.filter((i) => i.status === filters.status);
  return list;
}
