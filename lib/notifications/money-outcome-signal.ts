"use client";

/**
 * 돈 처리 결과 알림 신호 (재감사 R1 · Owner 2026-11-03 · N-3 FAIL).
 *
 * 관리자가 포인트 충전·Cash 충전·Coin 출금을 처리하면 서버가 알림(notification_events)을 만든다.
 * 이미 앱당 1회 붙어 있는 알림 Realtime 구독이 그 INSERT 를 받을 때 여기로 넘기고,
 * 열린 돈 화면은 자기 범위(회원 / 그 매장)의 신호만 받아 조용히 다시 읽는다.
 * 이전(c5f0b8395)에는 회원 종 숫자 증가만 봤는데, 매장 단위 알림은 회원 종 숫자에서 빠져(B-04) 사장님 화면이 한 번도 갱신되지 않았다.
 * 종 숫자·소리·푸시 경로는 바꾸지 않는다 — 신호만 낸다.
 */
import {
  resolveNotificationEventKind,
  resolveNotificationEventStoreId,
} from "@/lib/notifications/core/notification-event-kind";

/** 회원(매장 없음) — 포인트 충전 처리 결과 */
export const MEMBER_MONEY_OUTCOME_KINDS: ReadonlySet<string> = new Set([
  "user_point_charge_approved",
  "user_point_charge_rejected",
  "user_point_charge_on_hold",
]);

/** 매장 — Cash 충전·Coin 출금 처리 결과 */
export const STORE_MONEY_OUTCOME_KINDS: ReadonlySet<string> = new Set([
  "delivery_ad_business_cash_charge_completed",
  "delivery_ad_business_cash_charge_rejected",
  "store_coin_withdrawal_rejected",
  "store_coin_withdrawal_paid",
]);

/** 매장 — Cash 충전 결과만 (Cash 잔액·충전 목록·미납 자동 납부·전환 미납 차감에 영향) */
export const STORE_CASH_CHARGE_OUTCOME_KINDS: ReadonlySet<string> = new Set([
  "delivery_ad_business_cash_charge_completed",
  "delivery_ad_business_cash_charge_rejected",
]);

/** 매장 — Coin 출금 결과만 (Coin 잔액·출금 목록에 영향) */
export const STORE_COIN_WITHDRAWAL_OUTCOME_KINDS: ReadonlySet<string> = new Set([
  "store_coin_withdrawal_rejected",
  "store_coin_withdrawal_paid",
]);

export const MONEY_OUTCOME_EVENT = "samarket:money-outcome";

export type MoneyOutcomeSignal = { kind: string; storeId: string | null };

function record(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** 알림 행(notification_events 또는 레거시 notifications) → 신호. 돈 처리 결과가 아니면 null. */
export function moneyOutcomeFromNotificationRow(row: Record<string, unknown> | null | undefined): MoneyOutcomeSignal | null {
  if (!row) return null;
  const meta = record(row.meta);
  // 원본 notification_events 행(display_payload) · Realtime 어댑터 행(event_kind·meta=legacyMeta) 둘 다
  const kind =
    resolveNotificationEventKind(row.display_payload) ||
    String(row.event_kind ?? "").trim() ||
    String(meta?.kind ?? "").trim();
  if (!kind) return null;
  const storeId =
    resolveNotificationEventStoreId(row.display_payload) ||
    String(row.event_store_id ?? "").trim() ||
    String(meta?.store_id ?? "").trim() ||
    null;
  if (STORE_MONEY_OUTCOME_KINDS.has(kind)) return storeId ? { kind, storeId } : null;
  if (MEMBER_MONEY_OUTCOME_KINDS.has(kind)) return { kind, storeId: null };
  return null;
}

export function emitMoneyOutcomeFromNotificationRow(row: Record<string, unknown> | null | undefined): void {
  if (typeof window === "undefined") return;
  const signal = moneyOutcomeFromNotificationRow(row);
  if (!signal) return;
  window.dispatchEvent(new CustomEvent<MoneyOutcomeSignal>(MONEY_OUTCOME_EVENT, { detail: signal }));
}

/** 이 화면 범위의 신호인지 — 회원 화면 = 매장 없는 신호, 사장님 화면 = 그 매장 신호. */
/**
 * 이 화면이 받을 신호인지 — 범위(회원 / 그 매장) + 종류(재감사 E-3).
 * `kinds` = 그 화면 값에 영향을 주는 종류만. 이전: 종류를 안 거름 → Coin 출금 신호 1건에 상관없는 화면까지 다시 읽음.
 */
export function moneyOutcomeMatchesScope(
  signal: MoneyOutcomeSignal,
  scope: { storeId: string | null; kinds?: ReadonlySet<string> | null }
): boolean {
  const sid = scope.storeId?.trim() || null;
  const inScope = sid ? signal.storeId === sid : signal.storeId == null;
  return inScope && (!scope.kinds || scope.kinds.has(signal.kind));
}

export function subscribeMoneyOutcome(listener: (signal: MoneyOutcomeSignal) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvent = (e: Event) => {
    const detail = (e as CustomEvent<MoneyOutcomeSignal>).detail;
    if (detail && typeof detail.kind === "string") listener(detail);
  };
  window.addEventListener(MONEY_OUTCOME_EVENT, onEvent);
  return () => window.removeEventListener(MONEY_OUTCOME_EVENT, onEvent);
}
