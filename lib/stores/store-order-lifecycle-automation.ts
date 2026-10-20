/**
 * 주문 수명주기 자동화(크론) 단일 정의 — 자동 구매확정·접수 독촉·미접수 자동 취소·SLA 스캔.
 *
 * - 기준 시각 이전 생성 주문은 개발·테스트 자료(Owner D-5)라 자동화 대상에서 제외한다.
 *   수수료 재활성 기준 시각(`20270602100100`)·SLA 스캔 기준(`20270602110000`)과 같은 값이어야 한다.
 * - 접수 제한시간: Owner 승인 1-A(권고안) — 결제 완료 `pending` 주문이 이 시간 안에 접수되지 않으면 SYSTEM 이 취소한다.
 */
export const STORE_ORDER_AUTOMATION_FROM_ISO = "2026-10-20T20:30:00.000Z";

export const STORE_ORDER_ACCEPT_TIMEOUT_MINUTES = 10;

/** `created_at <= 이 시각` 인 pending 은 접수 제한시간이 지났다. */
export function storeOrderAcceptTimeoutCutoffIso(nowMs: number = Date.now()): string {
  return new Date(nowMs - STORE_ORDER_ACCEPT_TIMEOUT_MINUTES * 60_000).toISOString();
}

export function isStoreOrderInAutomationScope(createdAt: string | null | undefined): boolean {
  const t = createdAt ? new Date(createdAt).getTime() : NaN;
  if (!Number.isFinite(t)) return false;
  return t >= new Date(STORE_ORDER_AUTOMATION_FROM_ISO).getTime();
}
