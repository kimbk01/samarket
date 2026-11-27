/**
 * 어드민 문의 상태 표시 단일 정의 (최종 감사 2026-11-28 U-6 · U-13).
 * 고객센터 콘솔(/admin/support)과 커뮤니티·거래 문의 목록이 같은 상태를 같은 이름·같은 색으로 그린다.
 *   답변 필요(OPEN·WAITING_ADMIN) = 빨강 · 고객 확인 대기(WAITING_USER) = 노랑 · 종료·보관 = 회색
 * 상태 이름은 `supportAdminStatusLabel`, 탭 이름은 아래 표 — 종료 탭은 고객센터 자체 키(영어 「Resolved」 = 알약과 같음).
 */
import type { AdminTone } from "@/components/admin/ui/AdminToneBadge";
import type { MessageKey } from "@/lib/i18n/messages";
import type { AdminSupportTab } from "@/lib/support/support-case-types";

export const ADMIN_SUPPORT_TAB_LABEL_KEY: Record<AdminSupportTab, MessageKey> = {
  ACTIONABLE: "admin_needs_reply",
  WAITING_USER: "admin_waiting_customer",
  RESOLVED: "support_admin_status_resolved",
  ARCHIVED: "support_admin_status_archived",
  ALL: "admin_all",
};

export function adminSupportStatusTone(status: string | null | undefined): AdminTone {
  switch (String(status ?? "").trim()) {
    case "OPEN":
    case "WAITING_ADMIN":
      return "danger";
    case "WAITING_USER":
      return "waiting";
    default:
      return "neutral";
  }
}
