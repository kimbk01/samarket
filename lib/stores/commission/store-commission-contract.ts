
import { catalogPair } from "@/lib/i18n/catalog-pair";/**
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

/**
 * Ledger filter: a row state, every row, rows with a recorded decision, or rows by decision
 * (approved = refund approved incl. legacy auto reversal · rejected = refund rejected).
 */
export type StoreCommissionLedgerFilterState = StoreCommissionRowState | "all" | "decided" | "approved" | "rejected";

export const STORE_COMMISSION_FILTER_STATES: readonly StoreCommissionLedgerFilterState[] = [
  "all",
  "review_required",
  "outstanding",
  "charged",
  "decided",
  "approved",
  "rejected",
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
  breakdown: "store_commission_breakdown",
  payable: "store_platform_payable_page",
} as const;

/**
 * Completed-order payout class (`store_platform_payable_page`) — Owner D-2 option A (separate rails):
 * - direct_collected: buyer paid the store directly — the platform owes nothing
 * - payable: platform-funded coupon not yet paid as Coin (the Coin rail)
 * - gift_rail: gift certificate merchant net — paid on the gift rail by an admin gift payout, never as Coin
 * - legacy_manual_paid: an old per-order "paid" settlement for money the store already collected
 */
export type StorePayoutClass = "direct_collected" | "payable" | "gift_rail" | "legacy_manual_paid";

export const STORE_PAYOUT_CLASS_LABEL: Record<StorePayoutClass, { ko: string; en: string }> = {
  direct_collected: catalogPair("stores_collected_by_store_no_payout"),
  payable: catalogPair("stores_platform_owes_store_coupon_coin_pending"),
  gift_rail: catalogPair("stores_gift_rail_payable_net_paid_via"),
  legacy_manual_paid: catalogPair("stores_legacy_manual_payout_review"),
};

/** UTC cutoff for stage 2-B money rules — earlier sale Coin rows are `legacy_preserved` (D-5, never corrected). */
export const STAGE2_MONEY_RULE_CUTOFF_UTC = "2026-10-20T20:30:00Z" as const;

/** Integrity check key (`store_commission_integrity_report`): per-order sale Coin ≤ platform-funded coupon. */
export const SALE_COIN_CAP_INTEGRITY_CHECK = "sale_coin_le_platform_coupon" as const;

/** DB error raised by `credit_coin_from_confirmed_sale` when a mint exceeds the order's platform coupon. */
export const COIN_MINT_EXCEEDS_PLATFORM_HELD_ERROR = "coin_mint_exceeds_platform_held" as const;

export type StorePlatformPayableSplit = {
  /** Buyer → store directly (incl. delivery fee). */
  directPhp: number;
  /** Gift certificate DIBAY fee (platform revenue). */
  giftFeePhp: number;
  /** Gift certificate merchant net — gift rail (admin gift payout). */
  giftRailNetPhp: number;
  /** Platform-funded coupon — Coin rail (`sale_coin:{orderId}`). */
  coinDuePhp: number;
  /** Platform → store = gift rail net + Coin. */
  platformOwesPhp: number;
  /** Store sale receipts before commission = direct + gift rail net + Coin. */
  storeReceiptsPhp: number;
};

/**
 * Pure mirror of the per-order split in `store_platform_payable_page` (display / tests only — money is DB).
 * H §2 example: direct 610, gift 300 (fee 30 → net 270), coupon 40 → platform owes 310 = 270 + 40.
 */
export function computeStorePlatformPayableSplit(input: {
  paymentAmountPhp: number;
  giftRedeemedPhp: number;
  giftMerchantNetPhp: number;
  platformFundedPhp: number;
}): StorePlatformPayableSplit {
  const n = (v: number) => Math.max(0, Math.trunc(Number(v) || 0));
  const directPhp = n(input.paymentAmountPhp);
  const giftGross = n(input.giftRedeemedPhp);
  const giftRailNetPhp = Math.min(giftGross, n(input.giftMerchantNetPhp));
  const coinDuePhp = n(input.platformFundedPhp);
  const platformOwesPhp = giftRailNetPhp + coinDuePhp;
  return {
    directPhp,
    giftFeePhp: giftGross - giftRailNetPhp,
    giftRailNetPhp,
    coinDuePhp,
    platformOwesPhp,
    storeReceiptsPhp: directPhp + platformOwesPhp,
  };
}

/**
 * Sale commission — current approved contract (Owner D-3, `store_commission_charge_order_internal`):
 * base = payment_amount (delivery fee included) + gift_redemption_amount + platform_funded_amount,
 * fee = min(base, min(base, floor(base × fee_percent / 100)) + fixed_fee) (PHP, then × 100 → Cash minor).
 * The gift portion is charged both the gift fee and this sale fee. `delivery_fee_mode = percent` is
 * refused (D-3). Pure mirror for display / tests — the DB trigger is the only writer.
 */
export function computeStoreSaleCommissionPhp(input: {
  paymentAmountPhp: number;
  giftRedemptionPhp: number;
  platformFundedPhp: number;
  feePercent: number;
  fixedFeePhp: number;
}): { basePhp: number; feePhp: number } {
  const n = (v: number) => Math.max(0, Math.trunc(Number(v) || 0));
  const basePhp = n(input.paymentAmountPhp) + n(input.giftRedemptionPhp) + n(input.platformFundedPhp);
  const pct = Math.max(0, Number(input.feePercent) || 0);
  const percentFee = Math.min(basePhp, Math.floor((basePhp * pct) / 100));
  return { basePhp, feePhp: Math.min(basePhp, percentFee + n(input.fixedFeePhp)) };
}

/** D-3: `delivery_fee_mode = percent` would charge the delivery fee twice (it is already in the base). */
export const DELIVERY_FEE_PERCENT_MODE_DISABLED_ERROR = "delivery_fee_percent_mode_disabled" as const;

export function isDeliveryFeeModeAllowed(mode: unknown): boolean {
  return String(mode ?? "none").trim().toLowerCase() !== "percent";
}

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
/** 미납 수수료 합계 = 매장별 미납(outstandingMinor) 합 — 수수료 원장 「미납 관리」와 통합 대시보드 「미납 수수료」가 같은 함수. */
export function sumStoreCashOutstandingMinor(positions: readonly Pick<StoreCashPosition, "outstandingMinor">[]): number {
  return positions.reduce((n, p) => n + p.outstandingMinor, 0);
}

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
  charged: catalogPair("stores_charged_2"),
  outstanding: catalogPair("stores_outstanding_2"),
  review_required: catalogPair("stores_under_review"),
  refunded: catalogPair("stores_fee_refunded"),
  kept: catalogPair("stores_refund_rejected"),
};

export const STORE_COMMISSION_FILTER_LABEL: Record<StoreCommissionLedgerFilterState, { ko: string; en: string }> = {
  all: catalogPair("stores_all"),
  decided: catalogPair("stores_all_decisions"),
  approved: catalogPair("stores_refund_approved"),
  rejected: catalogPair("stores_refund_rejected"),
  ...STORE_COMMISSION_ROW_STATE_LABEL,
};

/** Design tokens (light + dark via prefers-color-scheme) — never raw palette colors. */
export const STORE_COMMISSION_ROW_STATE_CHIP: Record<StoreCommissionRowState, string> = {
  charged: "bg-sam-success-soft text-sam-success",
  outstanding: "bg-sam-danger-soft text-sam-danger",
  review_required: "bg-sam-warning-soft text-sam-warning",
  refunded: "bg-signature/10 text-signature",
  kept: "bg-sam-surface-muted text-sam-muted",
};

export const STORE_COMMISSION_DECISION_LABEL: Record<StoreCommissionAdjustmentRecordDecision, { ko: string; en: string }> = {
  approve: catalogPair("stores_refund_approved"),
  reject: catalogPair("stores_refund_rejected"),
  legacy_auto: catalogPair("stores_automatic_refund_legacy"),
};

export const STORE_CASH_ORDER_GATE_LABEL: Record<StoreCashOrderGateMode, { ko: string; en: string }> = {
  off: catalogPair("stores_off_orders_accepted_even_when_negative"),
  block_when_not_positive: catalogPair("stores_block_new_orders_when_net_cash"),
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

/** 이름 = `lib/finance/presentation` TYPE_LABELS 와 같은 1벌 (관리자·사장님 공용 · 금융 SSOT) */
export const BUSINESS_CASH_LEDGER_KIND_LABEL: Record<BusinessCashLedgerKind, { ko: string; en: string }> = {
  TOP_UP: catalogPair("stores_cash_top_up"),
  CONVERT_FROM_STORE_POINTS: catalogPair("stores_coin_cash_convert_cash_in"),
  SALE_FEE: catalogPair("stores_sale_fee"),
  SALE_FEE_SETTLEMENT: catalogPair("stores_unpaid_fee_settlement"),
  SALE_FEE_REVERSAL: catalogPair("stores_fee_refund"),
  AD_SPEND: catalogPair("stores_ad_spend"),
  AD_REFUND: catalogPair("stores_ad_refund"),
  PARTNER_SPEND: catalogPair("stores_partner_spend"),
  PARTNER_REFUND: catalogPair("stores_partner_refund"),
  ADMIN_ADJUST: catalogPair("stores_balance_adjustment"),
  SYSTEM: catalogPair("stores_system"),
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
