/**
 * 18단계: 관리자 감사 로그 타입
 */

export type AuditLogCategory =
  | "product"
  | "user"
  | "chat"
  | "report"
  | "review"
  | "setting"
  | "auth";

export type AuditLogActionType =
  | "create"
  | "update"
  | "delete"
  | "hide"
  | "restore"
  | "warn"
  | "suspend"
  | "ban"
  | "login"
  | "logout"
  | "settings_update"
  | "review_only";

export type AuditLogResult = "success" | "warning" | "error";

export interface AdminAuditLog {
  id: string;
  category: AuditLogCategory;
  actionType: AuditLogActionType;
  result: AuditLogResult;
  adminId: string;
  adminNickname: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  summary: string;
  beforeData?: string | Record<string, unknown>;
  afterData?: string | Record<string, unknown>;
  createdAt: string;
  ipAddress?: string;
  note?: string;
}

export interface AuditSummary {
  todayCount: number;
  warningCount: number;
  errorCount: number;
  topAdminNickname: string;
  topCategory: AuditLogCategory;
  latestActionAt: string;
}
