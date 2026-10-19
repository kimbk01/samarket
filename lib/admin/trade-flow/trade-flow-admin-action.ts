/**
 * 거래 흐름 Admin 조치(되돌리기·구매자 확정) 공통 — 권한 키·사유 기준 (client-safe 상수).
 * 서버 라우트와 화면이 같은 값을 쓴다.
 */
export const TRADE_FLOW_ADMIN_PERMISSION = "products" as const;
export const TRADE_FLOW_ADMIN_REASON_MIN_LENGTH = 2;

export function parseTradeFlowAdminReason(value: unknown): string | null {
  const reason = typeof value === "string" ? value.trim() : "";
  return reason.length >= TRADE_FLOW_ADMIN_REASON_MIN_LENGTH ? reason.slice(0, 500) : null;
}
