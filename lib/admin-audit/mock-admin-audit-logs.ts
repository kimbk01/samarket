/**
 * 18단계: 관리자 감사 로그 mock (12~17단계 연동 시 push 추가)
 */

import type { AdminAuditLog } from "@/lib/types/admin-audit";

const now = () => new Date().toISOString();

export const MOCK_ADMIN_AUDIT_LOGS: AdminAuditLog[] = [
  {
    id: "al-1",
    category: "report",
    actionType: "review_only",
    result: "success",
    adminId: "admin",
    adminNickname: "관리자",
    targetType: "report",
    targetId: "rpt-seed-1",
    targetLabel: "상품 신고",
    summary: "신고 검토완료 처리",
    createdAt: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    note: "",
  },
  {
    id: "al-2",
    category: "product",
    actionType: "update",
    result: "success",
    adminId: "admin",
    adminNickname: "관리자",
    targetType: "product",
    targetId: "1",
    targetLabel: "아이폰 14 Pro 256GB",
    summary: "상품 상태 변경",
    beforeData: { status: "active" },
    afterData: { status: "blinded" },
    createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
  {
    id: "al-3",
    category: "user",
    actionType: "warn",
    result: "success",
    adminId: "admin",
    adminNickname: "관리자",
    targetType: "user",
    targetId: "s2",
    targetLabel: "판매자B",
    summary: "회원 경고 처리",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: "al-4",
    category: "setting",
    actionType: "settings_update",
    result: "success",
    adminId: "admin",
    adminNickname: "관리자",
    targetType: "setting",
    targetId: "siteName",
    targetLabel: "사이트명",
    summary: "운영설정 변경",
    beforeData: "KASAMA",
    afterData: "KASAMA",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: "al-5",
    category: "review",
    actionType: "hide",
    result: "success",
    adminId: "admin",
    adminNickname: "관리자",
    targetType: "review",
    targetId: "rv-1",
    targetLabel: "후기",
    summary: "리뷰 숨김 처리",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
];

export function getAuditLogs(): AdminAuditLog[] {
  return [...MOCK_ADMIN_AUDIT_LOGS];
}

export function getAuditLogById(id: string): AdminAuditLog | undefined {
  return MOCK_ADMIN_AUDIT_LOGS.find((l) => l.id === id);
}

/** 12~17단계에서 호출해 로그 추가 (연동 시 사용) */
export function pushAuditLog(log: Omit<AdminAuditLog, "id" | "createdAt">): void {
  MOCK_ADMIN_AUDIT_LOGS.unshift({
    ...log,
    id: `al-${Date.now()}`,
    createdAt: now(),
  });
}
