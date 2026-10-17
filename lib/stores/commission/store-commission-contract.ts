/**
 * Store Commission × Business Cash — SSOT contract (labels, types, pure helpers).
 * Doc: docs/store-commission-cash-settlement-ssot.md
 * Migration (money authority): supabase/migrations/20270510120000_store_commission_cash_ssot.sql
 *
 * Payment model: buyers pay the STORE directly (COD / store GCash / bank transfer).
 * The platform never holds `payment_amount` → there is NO per-order payout to stores.
 * Platform revenue (commission) is collected from the store's prepaid Business Cash.
 *
 * | Event                                   | Money effect (DB, same transaction as the status change) |
 * |-----------------------------------------|-----------------------------------------------------------|
 * | → preparing (조리 시작) or any later status | Commission charged once; Cash debit up to balance, rest = outstanding |
 * | cancel/refund after the charge          | NO auto refund → review_required                            |
 * | admin approve (full/partial)            | outstanding cancelled first, then paid part back to Cash    |
 * | admin reject                            | nothing moves; outstanding stays owed                       |
 * | Cash top-up / Coin→Cash                 | oldest outstanding settled first                            |
 * | NET <= 0 and gate on                    | new store_orders INSERT rejected (`store_cash_insufficient`) |
 *
 * All amounts in this module are Cash minor units (centavos) unless suffixed `Php`.
 * The browser never computes money: rows, states and totals come from DB functions.
 */

/** First order status at which the commission is charged (조리 시작). */
export const STORE_COMMISSION_CHARGE_STATUS = "preparing" as const;

/** Statuses that charge the commission if it was not charged yet (DB trigger list). */
export const STORE_COMMISSION_CHARGED_ORDER_STATUSES = [
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
  "completed",
] as const;

export type StoreCommissionChargeStage = (typeof STORE_COMMISSION_CHARGED_ORDER_STATUSES)[number];

export type StoreCommissionAdjustmentStatus = "none" | "review_required" | "refunded" | "kept";

export type StoreCommissionDecision = "approve" | "reject";

export type StoreCommissionAdjustmentRecordDecision = StoreCommissionDecision | "legacy_auto";

/** Row state — computed in SQL (`store_commission_ledger_page`), labelled here. */
export type StoreCommissionRowState = "charged" | "outstanding" | "review_required" | "refunded" | "kept";

/** Ledger filter: a row state, every row, or rows that carry a recorded decision. */
export type StoreCommissionLedgerFilterState = StoreCommissionRowState | "all" | "decided";

export const STORE_COMMISSION_FILTER_STATES: readonly StoreCommissionLedgerFilterState[] = [
  "all",
  "review_required",
  "outstanding",
  "charged",
  "decided",
  "refunded",
  "kept",
] as const;

/** admin_settings.key — value_json: { value, reason, by, at } */
export const STORE_CASH_ORDER_GATE_SETTING_KEY = "store_cash_order_gate" as const;

export type StoreCashOrderGateMode = "off" | "block_when_not_positive";

export const STORE_CASH_ORDER_GATE_MODES: readonly StoreCashOrderGateMode[] = [
  "off",
  "block_when_not_positive",
] as const;

export function normalizeStoreCashOrderGateMode(raw: unknown): StoreCashOrderGateMode {
  return raw === "block_when_not_positive" ? "block_when_not_positive" : "off";
}

/** DB trigger / checkout error code when the store cannot take new orders. */
export const STORE_CASH_INSUFFICIENT_ERROR = "store_cash_insufficient" as const;

/** DB trigger error when an order cannot enter a cooking status (e.g. no fee policy). */
export const STORE_COMMISSION_CHARGE_FAILED_ERROR = "store_commission_charge_failed" as const;

export const STORE_COMMISSION_RPC = {
  flagReview: "flag_store_commission_review",
  decide: "admin_decide_store_commission_adjustment",
  position: "store_cash_position",
  ledgerPage: "store_commission_ledger_page",
  cashLedgerPage: "store_cash_ledger_page",
  integrity: "store_commission_integrity_report",
} as const;

export type StoreCashPosition = {
  storeId: string;
  /** Cash actually on account (always >= 0). */
  balanceMinor: number;
  /** Open commission not yet paid from Cash. */
  outstandingMinor: number;
  /** balance − outstanding — negative when the store owes more than it holds. */
  netMinor: number;
  gateMode: StoreCashOrderGateMode;
  /** Same rule as the DB trigger. */
  orderable: boolean;
};

/** TS mirror of `public.store_cash_position` (same rule as the DB gate). */
export function computeStoreCashPosition(input: {
  storeId: string;
  balanceMinor: number;
  outstandingMinor: number;
  gateMode: StoreCashOrderGateMode;
}): StoreCashPosition {
  const balanceMinor = Math.max(0, Math.trunc(Number(input.balanceMinor) || 0));
  const outstandingMinor = Math.max(0, Math.trunc(Number(input.outstandingMinor) || 0));
  const netMinor = balanceMinor - outstandingMinor;
  return {
    storeId: input.storeId,
    balanceMinor,
    outstandingMinor,
    netMinor,
    gateMode: input.gateMode,
    orderable: input.gateMode === "off" || netMinor > 0,
  };
}

/**
 * Approve split — identical to the DB function (shown in the confirm step before submit).
 * Unpaid commission is cancelled first; Cash is refunded only for what was actually paid.
 */
export function splitStoreCommissionApproval(input: {
  approvedMinor: number;
  feePaidMinor: number;
  feeOutstandingMinor: number;
}): { outstandingCancelMinor: number; cashRefundMinor: number } | null {
  const approved = Math.trunc(Number(input.approvedMinor) || 0);
  const paid = Math.max(0, Math.trunc(Number(input.feePaidMinor) || 0));
  const outstanding = Math.max(0, Math.trunc(Number(input.feeOutstandingMinor) || 0));
  if (approved <= 0 || approved > paid + outstanding) return null;
  const outstandingCancelMinor = Math.min(approved, outstanding);
  return { outstandingCancelMinor, cashRefundMinor: approved - outstandingCancelMinor };
}

export const STORE_COMMISSION_ROW_STATE_LABEL: Record<StoreCommissionRowState, { ko: string; en: string }> = {
  charged: { ko: "차감 완료", en: "Charged" },
  outstanding: { ko: "미납(캐시 부족)", en: "Outstanding" },
  review_required: { ko: "취소·환불 검토 중", en: "Under review" },
  refunded: { ko: "수수료 환급", en: "Fee refunded" },
  kept: { ko: "환급 거절", en: "Refund rejected" },
};

export const STORE_COMMISSION_FILTER_LABEL: Record<StoreCommissionLedgerFilterState, { ko: string; en: string }> = {
  all: { ko: "전체", en: "All" },
  decided: { ko: "조정 이력", en: "Decisions" },
  ...STORE_COMMISSION_ROW_STATE_LABEL,
};

export const STORE_COMMISSION_ROW_STATE_CHIP: Record<StoreCommissionRowState, string> = {
  charged: "bg-emerald-100 text-emerald-950",
  outstanding: "bg-red-100 text-red-900",
  review_required: "bg-amber-100 text-amber-950",
  refunded: "bg-signature/10 text-signature",
  kept: "bg-sam-surface-muted text-sam-muted",
};

export const STORE_COMMISSION_DECISION_LABEL: Record<StoreCommissionAdjustmentRecordDecision, { ko: string; en: string }> = {
  approve: { ko: "환급 승인", en: "Refund approved" },
  reject: { ko: "환급 거절", en: "Refund rejected" },
  legacy_auto: { ko: "자동 환급(이전 방식)", en: "Automatic refund (legacy)" },
};

export const STORE_CASH_ORDER_GATE_LABEL: Record<StoreCashOrderGateMode, { ko: string; en: string }> = {
  off: { ko: "차단 안 함 (마이너스여도 주문 접수)", en: "Off (orders accepted even when negative)" },
  block_when_not_positive: {
    ko: "순잔액 0 이하이면 신규 주문 차단",
    en: "Block new orders when net cash <= 0",
  },
};

/** business_cash_ledger.entry_kind values shown in the Cash history filter. */
export const BUSINESS_CASH_LEDGER_KINDS = [
  "TOP_UP",
  "CONVERT_FROM_STORE_POINTS",
  "SALE_FEE",
  "SALE_FEE_SETTLEMENT",
  "SALE_FEE_REVERSAL",
  "AD_SPEND",
  "AD_REFUND",
  "PARTNER_SPEND",
  "PARTNER_REFUND",
  "ADMIN_ADJUST",
  "SYSTEM",
] as const;

export type BusinessCashLedgerKind = (typeof BUSINESS_CASH_LEDGER_KINDS)[number];

export const BUSINESS_CASH_LEDGER_KIND_LABEL: Record<BusinessCashLedgerKind, { ko: string; en: string }> = {
  TOP_UP: { ko: "캐시 충전", en: "Top-up" },
  CONVERT_FROM_STORE_POINTS: { ko: "Coin→캐시 전환", en: "Coin → Cash" },
  SALE_FEE: { ko: "수수료 차감", en: "Commission" },
  SALE_FEE_SETTLEMENT: { ko: "미납 수수료 정산", en: "Unpaid commission settled" },
  SALE_FEE_REVERSAL: { ko: "수수료 환급", en: "Commission refund" },
  AD_SPEND: { ko: "광고 사용", en: "Ad spend" },
  AD_REFUND: { ko: "광고 환불", en: "Ad refund" },
  PARTNER_SPEND: { ko: "제휴 사용", en: "Partner spend" },
  PARTNER_REFUND: { ko: "제휴 환불", en: "Partner refund" },
  ADMIN_ADJUST: { ko: "관리자 조정", en: "Admin adjustment" },
  SYSTEM: { ko: "시스템", en: "System" },
};

export function isBusinessCashLedgerKind(v: unknown): v is BusinessCashLedgerKind {
  return typeof v === "string" && (BUSINESS_CASH_LEDGER_KINDS as readonly string[]).includes(v);
}

/** PHP integer → Cash minor (centavos). */
export function phpToCashMinor(php: number): number {
  return Math.round(Number(php) * 100);
}

/** Signed display for Admin + Owner — negative NET shows an explicit minus. */
export function formatCashMinorSigned(minor: number, formatPhp: (php: number) => string): string {
  const v = Math.trunc(Number(minor) || 0);
  const abs = formatPhp(Math.abs(v) / 100);
  return v < 0 ? `-${abs}` : abs;
}
