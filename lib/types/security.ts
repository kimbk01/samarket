/**
 * 56단계: 보안 / 권한 / RLS 점검 타입
 */

export type SecurityCheckType =
  | "rls"
  | "api"
  | "admin"
  | "auth"
  | "storage";

export type SecurityStatus = "safe" | "warning" | "critical";

export interface SecurityCheck {
  id: string;
  checkType: SecurityCheckType;
  target: string;
  status: SecurityStatus;
  description: string;
  lastCheckedAt: string;
}

export type SecurityIssueSeverity = "low" | "medium" | "high" | "critical";

export type SecurityIssueStatus = "open" | "fixed";

export interface SecurityIssue {
  id: string;
  checkId: string;
  issueTitle: string;
  severity: SecurityIssueSeverity;
  status: SecurityIssueStatus;
  note: string;
}
