/**
 * 거래 상위노출 주문 단계 — 판정 1곳 (재감사 2026-11-04 B-1).
 * DB 결제 함수 E-15 와 같은 규칙: 일시정지는 종료일과 관계없이 진행 중(재개되면 멈춘 시간만큼 연장).
 * 사용처: 광고하기 창·확인창 안내(`activeForTarget`), 내 매물 「광고 중」 탭, 내 광고 탭.
 */
export type TradeBoostOrderPhase = "pending" | "live" | "paused" | "ended";

export type TradeBoostOrderLike = {
  orderStatus?: string | null;
  startAt?: string | null;
  endAt?: string | null;
};

export function tradeBoostOrderPhase(order: TradeBoostOrderLike, nowMs: number = Date.now()): TradeBoostOrderPhase {
  const s = String(order.orderStatus ?? "").trim().toLowerCase();
  if (s === "pending" || s === "pending_review") return "pending";
  if (s === "paused") return "paused";
  if (s !== "active") return "ended";
  const start = Date.parse(String(order.startAt ?? ""));
  const end = Date.parse(String(order.endAt ?? ""));
  if (Number.isFinite(end) && end < nowMs) return "ended";
  if (Number.isFinite(start) && start > nowMs) return "pending";
  return "live";
}

/** 새 결제가 막히는 범위 = DB `already_active_promotion` 과 같음 */
export function isTradeBoostOrderOngoing(order: TradeBoostOrderLike, nowMs: number = Date.now()): boolean {
  return tradeBoostOrderPhase(order, nowMs) !== "ended";
}

/** 결제가 확정된 광고(노출 중 또는 일시정지) — 내 매물 「광고 중」 */
export function isTradeBoostOrderEntitled(order: TradeBoostOrderLike, nowMs: number = Date.now()): boolean {
  const p = tradeBoostOrderPhase(order, nowMs);
  return p === "live" || p === "paused";
}
