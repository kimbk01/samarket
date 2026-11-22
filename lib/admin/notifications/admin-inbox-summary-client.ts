/**
 * 2026-11-22 관리자 폴링 한 요청으로 — 작업 대기 수 폴러(`AdminStorePointPendingProvider`)가 받은 알림 요약을 함께 받아
 * 헤더 받은 알림 아이콘(`AdminInboxLink`)에 넘긴다. 아이콘은 자기 75초 폴링을 하지 않는다.
 * 요약은 75초에 1번만 함께 받는다(작업 대기 수가 Realtime 으로 더 자주 갱신돼도 요약 계산이 늘지 않게).
 */
import { NOTIFICATION_SYNC_POLL_MS } from "@/lib/notifications/notification-events";

export const ADMIN_INBOX_SUMMARY_EVENT = "dibay:admin-inbox-summary";

export type AdminInboxSummaryView = { unread: number; failed: boolean };

type Payload = {
  ok?: boolean;
  unread?: number;
  delivery?: { outboxDead?: number; pushDead?: number; unavailable?: boolean };
};

let last: { view: AdminInboxSummaryView; at: number } | null = null;

/** 응답 모양 → 아이콘 표시값(이전 `AdminInboxLink.load` 와 같은 판정) */
export function adminInboxSummaryViewFromPayload(json: Payload | null | undefined, resOk = true): AdminInboxSummaryView {
  if (!resOk || !json || !json.ok) return { unread: last?.view.unread ?? 0, failed: true };
  const d = json.delivery;
  return {
    unread: Math.max(0, Math.floor(Number(json.unread) || 0)),
    failed: Boolean(d && (d.unavailable || (d.outboxDead ?? 0) > 0 || (d.pushDead ?? 0) > 0)),
  };
}

export function isAdminInboxSummaryDue(nowMs: number = Date.now()): boolean {
  return !last || nowMs - last.at >= NOTIFICATION_SYNC_POLL_MS - 5_000;
}

export function peekAdminInboxSummary(): AdminInboxSummaryView | null {
  return last?.view ?? null;
}

export function publishAdminInboxSummary(view: AdminInboxSummaryView, nowMs: number = Date.now()): void {
  last = { view, at: nowMs };
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<AdminInboxSummaryView>(ADMIN_INBOX_SUMMARY_EVENT, { detail: view }));
  }
}

export function resetAdminInboxSummaryForTests(): void {
  last = null;
}
