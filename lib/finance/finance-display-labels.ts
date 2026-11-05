/**
 * 금융 표시 SSOT — 회원·오너·관리자가 같은 거래를 같은 이름·같은 번호로 본다.
 * DB 상태값·원장 종류는 그대로 두고 화면 이름만 여기서 연결한다.
 * 키는 `lib/i18n/catalog/points-ui.ts` (ko/en) — 문구를 바꾸면 카탈로그와 여기 기본 문구를 함께 바꾼다.
 */
import type { MessageKey } from "@/lib/i18n/messages";

export type FinanceLabel = { key: MessageKey; ko: string; en: string };

export type FinanceLabelTone = "info" | "warning" | "success" | "danger" | "muted";

export function financeLabelText(label: FinanceLabel, ko: boolean): string {
  return ko ? label.ko : label.en;
}

/** 회원·오너 화면의 처리 주체 — 관리자 개인 이름·id 는 관리자 화면에서만 */
export const FINANCE_PUBLIC_PROCESSOR: FinanceLabel = {
  key: "fin_processor_ops_team",
  ko: "운영팀",
  en: "DIBAY support",
};

// ── Point 충전 신청 (point_charge_requests.request_status) ──
const POINT_CHARGE_STATUS: Record<string, FinanceLabel & { tone: FinanceLabelTone }> = {
  pending: { key: "fin_status_deposit_requested", ko: "입금 신청", en: "Deposit requested", tone: "info" },
  waiting_confirm: { key: "fin_status_deposit_checking", ko: "입금 확인 중", en: "Checking deposit", tone: "warning" },
  on_hold: { key: "fin_status_on_hold", ko: "보류", en: "On hold", tone: "muted" },
  approved: { key: "fin_status_topup_done", ko: "충전 완료", en: "Top-up complete", tone: "success" },
  completed: { key: "fin_status_topup_done", ko: "충전 완료", en: "Top-up complete", tone: "success" },
  rejected: { key: "fin_status_rejected", ko: "반려", en: "Rejected", tone: "danger" },
  cancelled: { key: "fin_status_cancelled", ko: "취소", en: "Cancelled", tone: "muted" },
};

export function pointChargeStatusDisplay(status: string): (FinanceLabel & { tone: FinanceLabelTone }) | null {
  return POINT_CHARGE_STATUS[String(status ?? "").trim().toLowerCase()] ?? null;
}

// ── 매장 Cash 충전 신청 (business_cash_charge_requests.status) ──
const CASH_TOPUP_STATUS: Record<string, FinanceLabel & { tone: FinanceLabelTone }> = {
  PENDING: POINT_CHARGE_STATUS.pending!,
  APPROVED: POINT_CHARGE_STATUS.approved!,
  REJECTED: POINT_CHARGE_STATUS.rejected!,
  CANCELLED: POINT_CHARGE_STATUS.cancelled!,
};

export function cashTopUpStatusDisplay(status: string): (FinanceLabel & { tone: FinanceLabelTone }) | null {
  return CASH_TOPUP_STATUS[String(status ?? "").trim().toUpperCase()] ?? null;
}

// ── Coin 출금 신청 (coin_withdrawal_requests.status) — 신청과 실제 송금 완료를 구분 ──
const COIN_WITHDRAWAL_STATUS: Record<string, FinanceLabel & { tone: FinanceLabelTone }> = {
  REQUESTED: { key: "fin_status_withdraw_requested", ko: "출금 신청", en: "Withdrawal requested", tone: "warning" },
  APPROVED: { key: "fin_status_withdraw_approved", ko: "출금 승인 (송금 대기)", en: "Approved (awaiting transfer)", tone: "info" },
  PAID: { key: "fin_status_withdraw_paid", ko: "출금 완료", en: "Withdrawal paid", tone: "success" },
  REJECTED: { key: "fin_status_withdraw_rejected", ko: "반려 (Coin 환원)", en: "Rejected (Coin returned)", tone: "danger" },
  CANCELLED: POINT_CHARGE_STATUS.cancelled!,
};

export function coinWithdrawalStatusDisplay(status: string): (FinanceLabel & { tone: FinanceLabelTone }) | null {
  return COIN_WITHDRAWAL_STATUS[String(status ?? "").trim().toUpperCase()] ?? null;
}

// ── 결제 수단 — 내부 코드(manual_confirm 등)를 화면에 쓰지 않는다 ──
const PAYMENT_METHOD: Record<string, FinanceLabel> = {
  apple_iap: { key: "fin_method_apple_iap", ko: "Apple 결제", en: "Apple payment" },
  apple_iap_sandbox: { key: "fin_method_apple_iap_sandbox", ko: "Apple 테스트 결제 (Sandbox)", en: "Apple test payment (Sandbox)" },
  bank_transfer: { key: "fin_method_bank_deposit", ko: "계좌 입금", en: "Bank deposit" },
  manual_confirm: { key: "fin_method_bank_deposit", ko: "계좌 입금", en: "Bank deposit" },
  bank: { key: "fin_method_bank_deposit", ko: "계좌 입금", en: "Bank deposit" },
  gcash: { key: "fin_method_gcash", ko: "GCash", en: "GCash" },
};

export function financePaymentMethodDisplay(method: string | null | undefined): FinanceLabel | null {
  return PAYMENT_METHOD[String(method ?? "").trim().toLowerCase()] ?? null;
}

/** Coin 출금 지급 수단 (coin_withdrawal_requests.payout_method · destination_type) */
const PAYOUT_METHOD: Record<string, FinanceLabel> = {
  gcash: { key: "fin_method_gcash", ko: "GCash", en: "GCash" },
  bank: { key: "fin_payout_bank", ko: "은행 송금", en: "Bank transfer" },
  bank_transfer: { key: "fin_payout_bank", ko: "은행 송금", en: "Bank transfer" },
};

export function financePayoutMethodDisplay(method: string | null | undefined): FinanceLabel | null {
  return PAYOUT_METHOD[String(method ?? "").trim().toLowerCase()] ?? null;
}

/**
 * Point 충전 원장 줄 부제 — 결제 수단과 신청 상태로 만든다.
 * Apple 결제는 「입금 확인」이 아니다 (서명 검증 후 자동 충전).
 */
export function pointChargeSubtitle(paymentMethod: string | null | undefined, requestStatus: string): { ko: string; en: string } {
  const method = financePaymentMethodDisplay(paymentMethod);
  const st = pointChargeStatusDisplay(requestStatus);
  const parts = (ko: boolean) => [method ? financeLabelText(method, ko) : null, st ? financeLabelText(st, ko) : null].filter(Boolean).join(" · ");
  return { ko: parts(true), en: parts(false) };
}

/** Apple 환불 처리 원장 줄 — 회원·오너에게 보이는 고정 문구 (관리자 메모는 내부 기록에만) */
export const APPLE_REFUND_RECOVERED: FinanceLabel = {
  key: "fin_apple_refund_recovered",
  ko: "Apple 환불 회수",
  en: "Apple refund recovered",
};
export const APPLE_REFUND_REVERSED: FinanceLabel = {
  key: "fin_apple_refund_reversed",
  ko: "Apple 환불 취소 반영",
  en: "Apple refund reversal",
};

export function appleRefundLedgerLabel(relatedType: string | null | undefined): FinanceLabel | null {
  const rt = String(relatedType ?? "").trim();
  if (rt === "apple_iap_refund") return APPLE_REFUND_RECOVERED;
  if (rt === "apple_iap_refund_reversal") return APPLE_REFUND_REVERSED;
  return null;
}

/**
 * 거래번호 — 원장 행 id 앞 8자리 (대문자). 회원·오너·관리자가 같은 줄을 같은 번호로 부른다.
 * POINT = PL, CASH = BC, COIN = CN.
 */
export function financeTxNo(wallet: "POINT" | "CASH" | "COIN", ledgerId: string | null | undefined): string | null {
  const id = String(ledgerId ?? "").replace(/-/g, "").trim();
  if (id.length < 8) return null;
  const prefix = wallet === "POINT" ? "PL" : wallet === "CASH" ? "BC" : "CN";
  return `${prefix}-${id.slice(0, 8).toUpperCase()}`;
}

/** 연결 기록 참조번호 (충전 신청·출금 신청·광고 신청 등) — `#` + id 앞 8자리 */
export function financeRefNo(id: string | null | undefined): string | null {
  const v = String(id ?? "").replace(/-/g, "").trim();
  if (v.length < 6) return v ? `#${v.toUpperCase()}` : null;
  return `#${v.slice(0, 8).toUpperCase()}`;
}

/** Apple 거래 번호 — 끝 8자리만 (영수증 대조용) */
export function appleTransactionTail(transactionId: string | null | undefined): string | null {
  const v = String(transactionId ?? "").replace(/^apple:/, "").trim();
  if (!v) return null;
  return v.length > 8 ? `…${v.slice(-8)}` : v;
}
