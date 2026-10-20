/**
 * 대시보드 지표 = 이동 화면 값 (재설계 R8 · 수정 계획 1-1 「같은 함수 import」).
 *
 * 대시보드 지표와 그 지표가 이동하는 목록 API 가 **같은 조건**으로 세도록, 조건을 한 함수로만 둔다.
 * 목록 API·처리 대기 레지스트리(`admin-action-queue`)·도메인 대시보드·통합 대시보드가 모두 이 함수를 import 한다
 * (조건 복제 금지 — 한쪽만 바뀌면 숫자가 어긋난다). 계약 테스트:
 * `lib/admin/metrics/__tests__/dashboard-destination-contract.test.ts`.
 *
 * PostgREST 빌더(`q`)에 필터만 더한다 — select·정렬·페이지는 호출 쪽 몫. 클라이언트 안전(서버 모듈 import 없음).
 */
import { ADMIN_ACTIONABLE_STORE_APPROVAL } from "@/lib/admin/admin-ops-actionable-status";
import { ADMIN_SUPPORT_TAB_STATUSES, type AdminSupportTab } from "@/lib/support/support-case-types";

/* eslint-disable @typescript-eslint/no-explicit-any -- PostgREST builder chain */
type Q = any;

// ── 회원 탈퇴 요청 (/admin/users/deletion-requests ← /api/admin/account-deletion-requests) ──

/** 처리 대기 탈퇴 요청 = 접수·처리 중 */
export const ACCOUNT_DELETION_OPEN_STATUSES = ["requested", "processing"] as const;

/** `status` = open(기본·처리 대기) · all · 단일 상태값 */
export function applyAccountDeletionRequestStatusFilter(q: Q, status: string): Q {
  const s = String(status ?? "").trim().toLowerCase() || "open";
  if (s === "open") return q.in("status", [...ACCOUNT_DELETION_OPEN_STATUSES]);
  if (s === "all") return q;
  return q.eq("status", s);
}

// ── 거래 신고 (/admin/trade/reports ← /api/admin/trade/reports) ──

export const TRADE_REPORT_TABS = ["open", "sanctioned", "rejected", "all"] as const;
export type TradeReportTab = (typeof TRADE_REPORT_TABS)[number];

/** 처리 대기 거래 신고 = 접수 + 검토 중 */
export const TRADE_REPORT_OPEN_STATUSES = ["pending", "reviewing"] as const;

export const TRADE_REPORT_TAB_STATUSES: Readonly<Record<TradeReportTab, readonly string[] | null>> = {
  open: TRADE_REPORT_OPEN_STATUSES,
  sanctioned: ["sanctioned", "resolved", "reviewed"],
  rejected: ["rejected"],
  all: null,
};

export function isTradeReportTab(v: string): v is TradeReportTab {
  return (TRADE_REPORT_TABS as readonly string[]).includes(v);
}

export function applyTradeReportTabFilter(q: Q, tab: TradeReportTab): Q {
  const statuses = TRADE_REPORT_TAB_STATUSES[tab];
  return statuses ? q.in("status", [...statuses]) : q;
}

// ── 모임 신고 (/admin/philife/meeting-reports) ──

export const MEETING_REPORT_TAB_KEYS = ["pending", "reviewing", "resolved", "rejected", "all"] as const;
export type MeetingReportTabKey = (typeof MEETING_REPORT_TAB_KEYS)[number];

/** pending = 처리 대기(접수 + 검토 중) */
export const MEETING_REPORT_TAB_STATUSES: Readonly<Record<MeetingReportTabKey, readonly string[] | null>> = {
  pending: ["pending", "reviewing"],
  reviewing: ["reviewing"],
  resolved: ["resolved"],
  rejected: ["rejected"],
  all: null,
};

/** `?status=` — 없음·pending·open = 처리 대기, dismissed = 반려 */
export function resolveMeetingReportTab(raw: string | null | undefined): MeetingReportTabKey {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "dismissed") return "rejected";
  return (MEETING_REPORT_TAB_KEYS as readonly string[]).includes(s) ? (s as MeetingReportTabKey) : "pending";
}

export function applyMeetingReportTabFilter(q: Q, tab: MeetingReportTabKey): Q {
  const statuses = MEETING_REPORT_TAB_STATUSES[tab];
  return statuses ? q.in("status", [...statuses]) : q;
}

// ── 입점 심사 (/admin/stores?status= ← /api/admin/stores) ──

/** `status` = all(필터 없음) · actionable(심사 대기 계열) · 단일 approval_status */
export function applyStoreApprovalStatusFilter(q: Q, status: string): Q {
  const s = String(status ?? "").trim();
  if (!s || s === "all") return q;
  if (s === "actionable") return q.in("approval_status", [...ADMIN_ACTIONABLE_STORE_APPROVAL]);
  return q.eq("approval_status", s);
}

// ── 고객지원 (/admin/support ← /api/admin/support/cases?tab=) ──

export function applySupportCaseTabFilter(q: Q, tab: AdminSupportTab): Q {
  const statuses = ADMIN_SUPPORT_TAB_STATUSES[tab];
  return statuses ? q.in("status", [...statuses]) : q;
}

// ── 커뮤니티 글 (/admin/community/posts ← /api/admin/community/engine/posts) ──

export const COMMUNITY_POST_LIST_STATUSES = ["active", "hidden", "deleted"] as const;
export const COMMUNITY_POST_ORIGINS = ["member", "imported", "admin"] as const;

/** 상태·출처 필터 (모르는 값 = 필터 없음). origin = null 이면 출처 열이 없는 레거시 스키마. */
export function applyCommunityPostStatusOriginFilter(q: Q, f: { status?: string | null; origin?: string | null }): Q {
  let x = q;
  const status = String(f.status ?? "").trim();
  const origin = String(f.origin ?? "").trim().toLowerCase();
  if ((COMMUNITY_POST_LIST_STATUSES as readonly string[]).includes(status)) x = x.eq("status", status);
  if ((COMMUNITY_POST_ORIGINS as readonly string[]).includes(origin)) x = x.eq("origin_kind", origin);
  return x;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
