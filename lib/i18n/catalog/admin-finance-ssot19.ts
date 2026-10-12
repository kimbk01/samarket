/**
 * SSOT-19 finance admin errors (charge snapshot guard, payout evidence, settlement/Coin exclusivity).
 * Spread into runtime MESSAGES + MessageKey only — NOT into adminMessages
 * (adminMessages is at the TS7056 declaration-emit limit).
 */

export const adminFinanceSsot19Messages = {
  ko: {
    admin_api_err_snapshot_invalid: "충전 신청 스냅샷(요금제·금액)이 유효하지 않아 승인할 수 없습니다. 신청 내용을 확인해 주세요.",
    admin_api_err_payout_reference_required: "지급 참조번호를 입력해 주세요.",
    admin_stores_settlements_err_payout_reference_required: "지급 완료 처리에는 지급 수단과 지급 참조번호가 모두 필요합니다.",
    admin_stores_settlements_err_coin_recognized: "이 주문은 이미 판매 Coin으로 인식되어 현금 정산 지급 완료로 처리할 수 없습니다(이중 지급 방지).",
  },
  en: {
    admin_api_err_snapshot_invalid: "The charge request snapshot (plan/amount) is invalid, so it cannot be approved. Please review the request.",
    admin_api_err_payout_reference_required: "Enter a payout reference.",
    admin_stores_settlements_err_payout_reference_required: "Marking as paid requires both a payout method and a payout reference.",
    admin_stores_settlements_err_coin_recognized: "This order was already recognized as sale Coin, so the cash settlement cannot be marked paid (prevents double payout).",
  },
} as const;
