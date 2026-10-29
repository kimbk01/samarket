/**
 * 「전체 신고 현황」 원장 6종 정의 (감사 2026-10-30 RS-02 · 보완 §2) — 원장 키 · 표시 이름 · 조회 권한 화면 ·
 * 상태 매핑 · 처리 화면 링크. 처리(쓰기)는 각 도메인 화면·API 만 — 중앙 목록에서 추가 원장 4종은 조회만.
 * Client-safe 순수 모듈.
 */

import type { ReportStatus, ReportTargetType } from "@/lib/types/report";

export const ADMIN_REPORT_LEDGER_SOURCES = [
  "reports",
  "community_feed",
  "store_reports",
  "meeting_reports",
  "community_messenger_reports",
  "chat_reports",
] as const;
export type AdminReportLedgerSource = (typeof ADMIN_REPORT_LEDGER_SOURCES)[number];

/** 중앙에서 조회만 하는 원장 (처리는 도메인 화면) */
export const ADMIN_REPORT_READ_ONLY_LEDGERS = [
  "store_reports",
  "meeting_reports",
  "community_messenger_reports",
  "chat_reports",
] as const satisfies readonly AdminReportLedgerSource[];
export type AdminReportReadOnlyLedger = (typeof ADMIN_REPORT_READ_ONLY_LEDGERS)[number];

export function isAdminReportReadOnlyLedger(s: string): s is AdminReportReadOnlyLedger {
  return (ADMIN_REPORT_READ_ONLY_LEDGERS as readonly string[]).includes(s);
}

export const ADMIN_REPORT_LEDGER_LABEL: Record<AdminReportLedgerSource, { ko: string; en: string }> = {
  reports: { ko: "거래 · reports", en: "Trade · reports" },
  community_feed: { ko: "커뮤니티 · community_reports", en: "Community · community_reports" },
  store_reports: { ko: "배달 매장 · store_reports", en: "Store · store_reports" },
  meeting_reports: { ko: "모임 · meeting_reports", en: "Meeting · meeting_reports" },
  community_messenger_reports: { ko: "메신저 · community_messenger_reports", en: "Messenger · community_messenger_reports" },
  chat_reports: { ko: "거래 채팅(구) · chat_reports", en: "Trade chat (legacy) · chat_reports" },
};

/**
 * 원장 조회 권한 = 그 원장 도메인 화면의 열람 요구 권한 (`admin-route-access` 표 — 화면 요구 권한 = 그 화면 조회 API 가드).
 * `reports`·`community_feed` 는 이 API 자체 가드(`reports` 키)로 이미 보던 원장이라 표를 보지 않는다.
 */
export const ADMIN_REPORT_LEDGER_VIEW_HREF: Record<AdminReportReadOnlyLedger, string> = {
  store_reports: "/admin/store-reports",
  meeting_reports: "/admin/philife/meeting-reports",
  community_messenger_reports: "/admin/chats/reported",
  chat_reports: "/admin/chats/reported?domain=trade",
};

/** 추가 원장의 화면 대상 유형 (대상 유형 필터도 이 값으로 거른다) */
export const ADMIN_REPORT_LEDGER_TARGET_TYPE: Record<AdminReportReadOnlyLedger, ReportTargetType> = {
  store_reports: "product",
  meeting_reports: "community",
  community_messenger_reports: "chat",
  chat_reports: "chat",
};

/**
 * 원장 상태 → 화면 상태 (처리 대기 = pending·reviewing, 처리 완료 = resolved·sanctioned·reviewed, 반려 = rejected).
 * 표에 없는 값은 화면에서 pending (거래 RPC 와 같은 규칙).
 */
export const ADMIN_REPORT_LEDGER_STATUS_MAP: Record<AdminReportReadOnlyLedger, Record<string, ReportStatus>> = {
  /** store_reports: open · actioned · dismissed */
  store_reports: { open: "pending", actioned: "resolved", dismissed: "rejected" },
  /** meeting_reports CHECK: pending · reviewing · resolved · rejected */
  meeting_reports: { pending: "pending", reviewing: "reviewing", resolved: "resolved", rejected: "rejected" },
  /** community_messenger_reports CHECK: received · reviewing · resolved · rejected · sanctioned */
  community_messenger_reports: {
    received: "pending",
    reviewing: "reviewing",
    resolved: "resolved",
    rejected: "rejected",
    sanctioned: "sanctioned",
  },
  /** 레거시 chat_reports: received · triaging · escalated · actioned · dismissed */
  chat_reports: {
    received: "pending",
    triaging: "reviewing",
    escalated: "reviewing",
    actioned: "resolved",
    dismissed: "rejected",
  },
};

export function adminReportLedgerUiStatus(source: AdminReportReadOnlyLedger, raw: string | null | undefined): ReportStatus {
  return ADMIN_REPORT_LEDGER_STATUS_MAP[source][String(raw ?? "").trim().toLowerCase()] ?? "pending";
}

/** 화면 상태 필터 → 원장 원시 상태 목록. `null` = 조건 없음 · `[]` = 이 원장에 해당 상태 없음(0건). */
export function adminReportLedgerRawStatuses(source: AdminReportReadOnlyLedger, uiStatus: string): string[] | null {
  if (!uiStatus) return null;
  return Object.entries(ADMIN_REPORT_LEDGER_STATUS_MAP[source])
    .filter(([, ui]) => ui === uiStatus)
    .map(([raw]) => raw);
}

/** 행 처리 링크 — 각 도메인 처리 화면 (그 화면의 기존 딥링크 키). */
export function adminReportLedgerProcessHref(
  source: AdminReportReadOnlyLedger,
  row: { id: string; uiStatus: ReportStatus; roomId?: string | null }
): string {
  const room = String(row.roomId ?? "").trim();
  switch (source) {
    case "store_reports":
      return `/admin/store-reports?request=${encodeURIComponent(row.id)}`;
    case "meeting_reports":
      return `/admin/philife/meeting-reports?status=${row.uiStatus === "pending" ? "pending" : row.uiStatus === "reviewing" ? "reviewing" : row.uiStatus === "rejected" ? "rejected" : row.uiStatus === "resolved" ? "resolved" : "all"}`;
    case "community_messenger_reports": {
      const sp = new URLSearchParams({ type: "messenger", status: "all" });
      if (room) sp.set("target", room);
      return `/admin/chats/reported?${sp.toString()}`;
    }
    case "chat_reports": {
      const sp = new URLSearchParams({ domain: "trade", type: "trade_chat", status: "all" });
      if (room) sp.set("target", room);
      return `/admin/chats/reported?${sp.toString()}`;
    }
  }
}

/**
 * RS-03 — 거래 신고 화면으로 바로 가는 링크 (조건 보존). `/admin/reports?domain=trade` 는 redirect 에서 조건이 빠진다.
 * 상태 → 거래 탭: pending·reviewing → open(기본) · resolved·sanctioned·reviewed → sanctioned · rejected → rejected · 전체 → all.
 * 대상 유형: product → product · user → user · chat → chat_room (커뮤니티는 거래 화면에 없음 → 생략). 대상 id → targetId.
 */
export function adminTradeReportsHrefFromCentral(input: { status?: string; targetType?: string; target?: string }): string {
  const sp = new URLSearchParams();
  const st = String(input.status ?? "");
  const tab =
    st === "" ? "all"
    : st === "pending" || st === "reviewing" ? ""
    : st === "rejected" ? "rejected"
    : "sanctioned";
  if (tab) sp.set("tab", tab);
  const tt = String(input.targetType ?? "");
  const tradeType = tt === "product" ? "product" : tt === "user" ? "user" : tt === "chat" ? "chat_room" : "";
  if (tradeType) sp.set("targetType", tradeType);
  const target = String(input.target ?? "").trim();
  if (target) sp.set("targetId", target);
  const qs = sp.toString();
  return qs ? `/admin/trade/reports?${qs}` : "/admin/trade/reports";
}
