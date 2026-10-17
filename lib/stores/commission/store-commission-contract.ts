/**
 * Store Commission × Business Cash — SSOT contract.
 * Doc: docs/store-commission-cash-settlement-ssot.md
 * Migration: supabase/migrations/20270510120000_store_commission_cash_ssot.sql
 *
 * Payment model: buyers pay the STORE directly (COD / store GCash / bank transfer).
 * The platform never holds `payment_amount` → there is NO per-order payout to stores.
 * Platform revenue (commission) is collected from the store's prepaid Business Cash.
 *
 * | Event                         | Money effect (automatic unless noted)                         |
 * |-------------------------------|---------------------------------------------------------------|
 * | accepted → preparing (조리 시작) | Commission debited from Cash; shortfall → open obligation     |
 * | completed                     | Safety-net charge (same idempotency key → never double)       |
 * | cancelled / refunded after charge | NO auto reversal → `review_required` (manual admin decision) |
 * | admin "수수료 환급"             | Paid part credited back to Cash, outstanding part cancelled    |
 * | admin "환급 안 함"              | Fee stays (still owed if outstanding)                         |
 * | Cash top-up / Coin→Cash        | Oldest open obligations settled first                         |
 * | NET position <= 0 (gate on)    | New orders rejected (DB trigger `store_cash_insufficient`)    |
 */

/** Order status that triggers the commission charge (조리 시작). */
export const STORE_COMMISSION_CHARGE_STATUS = "preparing" as const;

export type StoreCommissionChargeStage = "preparing" | "completed";

export type StoreCommissionAdjustmentStatus = "none" | "review_required" | "refunded" | "kept";

export type StoreCommissionAdjustmentDecision = "refund" | "keep";

/** admin_settings.key — value_json: { "value": StoreCashOrderGateMode } */
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

export const STORE_COMMISSION_RPC = {
  charge: "charge_store_commission_for_order",
  flagReview: "flag_store_commission_review",
  resolveAdjustment: "admin_resolve_store_commission_adjustment",
  position: "store_cash_position",
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

/** Single TS mirror of `public.store_cash_position` — no other balance math in UI. */
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

/** Order statuses at/after 조리 시작 — a commission row must exist for these. */
export const STORE_COMMISSION_CHARGED_ORDER_STATUSES = [
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
  "completed",
] as const;

export type StoreCommissionRowState =
  | "charged"
  | "outstanding"
  | "review_required"
  | "refunded"
  | "kept";

/**
 * One label per row for Admin + Owner (same function → same wording on both sides).
 * Precedence: adjustment decision > money state.
 */
export function resolveStoreCommissionRowState(row: {
  status: string;
  adjustmentStatus: StoreCommissionAdjustmentStatus;
  feeOutstandingMinor: number;
}): StoreCommissionRowState {
  if (row.adjustmentStatus === "review_required") return "review_required";
  // `waived` without a decision = legacy automatic refund reversal (before manual review).
  if (row.adjustmentStatus === "refunded" || row.status === "waived") return "refunded";
  if (row.adjustmentStatus === "kept") return row.feeOutstandingMinor > 0 ? "outstanding" : "kept";
  if (row.status === "open" && row.feeOutstandingMinor > 0) return "outstanding";
  return "charged";
}

export const STORE_COMMISSION_ROW_STATE_LABEL: Record<StoreCommissionRowState, { ko: string; en: string }> = {
  charged: { ko: "차감 완료", en: "Charged" },
  outstanding: { ko: "미납(캐시 부족)", en: "Outstanding" },
  review_required: { ko: "취소·환불 검토 중", en: "Under review" },
  refunded: { ko: "수수료 환급", en: "Fee refunded" },
  kept: { ko: "환급 없음", en: "Fee kept" },
};

export const STORE_COMMISSION_ROW_STATE_CHIP: Record<StoreCommissionRowState, string> = {
  charged: "bg-emerald-100 text-emerald-950",
  outstanding: "bg-red-100 text-red-900",
  review_required: "bg-amber-100 text-amber-950",
  refunded: "bg-signature/10 text-signature",
  kept: "bg-sam-surface-muted text-sam-muted",
};

export const STORE_CASH_ORDER_GATE_LABEL: Record<StoreCashOrderGateMode, { ko: string; en: string }> = {
  off: { ko: "차단 안 함 (마이너스여도 주문 접수)", en: "Off (orders accepted even when negative)" },
  block_when_not_positive: {
    ko: "순잔액 0 이하이면 신규 주문 차단",
    en: "Block new orders when net cash <= 0",
  },
};

/** PHP integer → Cash minor (centavos). */
export function phpToCashMinor(php: number): number {
  return Math.max(0, Math.trunc(Number(php) || 0)) * 100;
}

/** Cash minor → PHP display number (may be negative for NET position). */
export function cashMinorToPhp(minor: number): number {
  return Math.trunc(Number(minor) || 0) / 100;
}

/** Signed display for Admin + Owner — negative NET shows an explicit minus. */
export function formatCashMinorSigned(minor: number, formatPhp: (php: number) => string): string {
  const v = Math.trunc(Number(minor) || 0);
  const abs = formatPhp(Math.abs(v) / 100);
  return v < 0 ? `-${abs}` : abs;
}
