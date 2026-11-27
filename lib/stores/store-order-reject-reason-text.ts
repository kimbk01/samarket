/**
 * 관리자 거절 사유 — 사유를 안 적은 거절의 저장값과 화면 문구 (재감사 2026-11-27 · 클라이언트·서버 공용 순수 모듈).
 *
 * - 새 행: 이벤트·알림에는 사유 `null` + `rejected_reason_code: "admin_default"` 만 남긴다.
 * - 취소 요청 원장 RPC 는 빈 사유를 거부하므로 원장에만 호환 최소값 `ADMIN_REJECT_LEDGER_REASON_FALLBACK` 을 넣는다.
 * - 옛 행·원장 값은 DB 를 고치지 않고, 화면이 `storeOrderRejectReasonForDisplay` 로 걸러 기본 문구 키를 쓴다.
 */

/** 취소 요청 원장(`store_order_cancel_requests.rejected_reason`) 호환 최소값 */
export const ADMIN_REJECT_LEDGER_REASON_FALLBACK = "Rejected by admin";

/** 옛 관리자 기본 사유(2026-11-27 이전 저장 문장) */
const LEGACY_ADMIN_DEFAULT_REJECT_REASONS: ReadonlySet<string> = new Set([
  ADMIN_REJECT_LEDGER_REASON_FALLBACK,
  "Refund request rejected by admin",
]);

/** 관리자가 사유를 적지 않은 거절인지 (원장 최소값·옛 문장) */
export function isAdminDefaultRejectReason(reason: string | null | undefined): boolean {
  return LEGACY_ADMIN_DEFAULT_REJECT_REASONS.has(String(reason ?? "").trim());
}

/**
 * 화면에 보여 줄 거절 사유 — 관리자 기본 사유는 `null`(화면은 사유 없는 문구 키 `order_event_rejected` 등을 쓴다).
 * 사람이 적은 사유는 그대로 돌려준다.
 */
export function storeOrderRejectReasonForDisplay(reason: string | null | undefined): string | null {
  const r = String(reason ?? "").trim();
  if (!r || isAdminDefaultRejectReason(r)) return null;
  return r;
}
