/**
 * Canonical Cash (AST-005) + Coin (AST-004) — Stage 1 finance SSOT.
 * New Delivery Ads / Partner payment authority. Never use archived store-cash records or delivery_ad_accounts.
 */

export const AST_004_STORE_POINTS_ECONOMIC = "AST-004" as const;
export const AST_005_BUSINESS_CASH = "AST-005" as const;

export const STORE_ECONOMIC_POINT_ACCOUNTS_TABLE = "store_economic_point_accounts" as const;
export const STORE_ECONOMIC_POINT_LEDGER_TABLE = "store_economic_point_ledger" as const;
export const BUSINESS_CASH_ACCOUNTS_TABLE = "business_cash_accounts" as const;
export const BUSINESS_CASH_LEDGER_TABLE = "business_cash_ledger" as const;
export const BUSINESS_CASH_CHARGE_REQUESTS_TABLE = "business_cash_charge_requests" as const;
export const BUSINESS_CASH_CONVERSION_RATE_POLICIES_TABLE =
  "business_cash_conversion_rate_policies" as const;
export const DELIVERY_AD_CANONICAL_BC_FUNDINGS_TABLE =
  "delivery_ad_canonical_bc_fundings" as const;

export const CONVERT_SP_TO_BC_RPC =
  "convert_store_economic_points_to_business_cash" as const;
export const GET_BC_CONVERSION_RATE_RPC = "get_business_cash_conversion_rate" as const;
export const APPROVE_BC_CHARGE_RPC = "approve_business_cash_charge_request" as const;
export const REJECT_BC_CHARGE_RPC = "reject_business_cash_charge_request" as const;
/** FIN-04 — owner top-up request writer (replaces the service_role TS INSERT; N-4B revokes direct writes). */
export const OWNER_CREATE_BC_CHARGE_RPC = "owner_create_business_cash_charge_request" as const;
/** FIN-04 / D-4 — top-up policy settings (caps · methods · receiving note). Defaults: no caps. */
export const BC_CHARGE_POLICY_RPC = "business_cash_charge_policy" as const;
/** FIN-08 — super_admin correction writers (ledger ADMIN_ADJUST + audit_logs, no negative balance). */
export const ADMIN_ADJUST_BC_RPC = "admin_adjust_business_cash" as const;
export const ADMIN_ADJUST_COIN_RPC = "admin_adjust_store_coin" as const;

/**
 * FIN-04 — deposit method keys accepted when the policy row is absent (DB default in
 * `business_cash_charge_policy()`). The live list always comes from the policy RPC.
 */
export const BC_CHARGE_DEFAULT_PAYMENT_METHODS = ["bank_transfer", "gcash", "other"] as const;

export type BusinessCashChargePolicy = {
  perRequestMaxMinor: number | null;
  monthlyMaxMinor: number | null;
  paymentMethods: string[];
  receivingAccountNote: string | null;
  paymentReferenceRequired: true;
};

export function parseBusinessCashChargePolicy(raw: unknown): BusinessCashChargePolicy {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const cap = (v: unknown): number | null => {
    const n = Math.trunc(Number(v));
    return v == null || !Number.isFinite(n) || n <= 0 ? null : n;
  };
  const methods = Array.isArray(p.payment_methods)
    ? p.payment_methods.map((m) => String(m ?? "").trim().toLowerCase()).filter(Boolean)
    : [];
  const note = typeof p.receiving_account_note === "string" ? p.receiving_account_note.trim() : "";
  return {
    perRequestMaxMinor: cap(p.per_request_max_minor),
    monthlyMaxMinor: cap(p.monthly_max_minor),
    paymentMethods: methods.length ? methods : [...BC_CHARGE_DEFAULT_PAYMENT_METHODS],
    receivingAccountNote: note || null,
    paymentReferenceRequired: true,
  };
}
export const BC_DELIVERY_AD_SPEND_RPC = "business_cash_delivery_ad_spend" as const;
export const BC_DELIVERY_AD_REFUND_RPC = "business_cash_delivery_ad_refund" as const;
export const CREDIT_STORE_ECONOMIC_POINTS_INFLOW_RPC =
  "credit_store_economic_points_inflow" as const;

/** Seeded policy default — do not hardcode into conversion math outside seed/policy read. */
export const BUSINESS_CASH_CONVERSION_DEFAULT_RATE_PESOS = 1 as const;

export const DELIVERY_AD_CANONICAL_PAYMENT_MODEL = {
  id: "DEBIT_REFUND_BUSINESS_CASH" as const,
  assetId: AST_005_BUSINESS_CASH,
  rule:
    "VALID submit → AST-005 BC AD_SPEND exactly once → SUBMITTED; terminal REJECT → AD_REFUND exactly once; CHANGES_REQUESTED/RESUBMIT preserve funds",
  supersededStoreCash: "DEBIT_REFUND_STORE_CASH_LEGACY_READ" as const,
} as const;

export const DELIVERY_AD_CANONICAL_BC_FUNDING_STATUSES = ["SECURED", "REFUNDED"] as const;
export type DeliveryAdCanonicalBcFundingStatus =
  (typeof DELIVERY_AD_CANONICAL_BC_FUNDING_STATUSES)[number];

export function resolveFundingStatusFromCanonicalBc(
  status: string | null | undefined
): "UNFUNDED" | "FUNDED" | "REFUNDED" {
  const s = String(status ?? "").trim();
  if (s === "SECURED") return "FUNDED";
  if (s === "REFUNDED") return "REFUNDED";
  return "UNFUNDED";
}

export type InsufficientBusinessCashPayload = {
  error: "INSUFFICIENT_BUSINESS_CASH";
  availableMinor: number;
  requiredMinor: number;
  shortageMinor: number;
  availablePhp: number;
  requiredPhp: number;
  shortagePhp: number;
  currency: string;
};

export function parseInsufficientBusinessCashRpc(
  payload: Record<string, unknown> | null | undefined
): InsufficientBusinessCashPayload | null {
  if (!payload || payload.error !== "INSUFFICIENT_BUSINESS_CASH") return null;
  const availableMinor = Math.trunc(Number(payload.available_minor) || 0);
  const requiredMinor = Math.trunc(Number(payload.required_minor) || 0);
  const shortageMinor = Math.trunc(
    Number(payload.shortage_minor) || Math.max(0, requiredMinor - availableMinor)
  );
  return {
    error: "INSUFFICIENT_BUSINESS_CASH",
    availableMinor,
    requiredMinor,
    shortageMinor,
    availablePhp: Math.trunc(Number(payload.available_php) || Math.floor(availableMinor / 100)),
    requiredPhp: Math.trunc(Number(payload.required_php) || Math.floor(requiredMinor / 100)),
    shortagePhp: Math.trunc(Number(payload.shortage_php) || Math.floor(shortageMinor / 100)),
    currency: String(payload.currency ?? "PHP"),
  };
}

/** DB-2 `preview_store_coin_conversion` 의 막힘 사유 (전환 RPC 오류 코드와 같은 이름·같은 순서). */
export type CoinConversionBlocker =
  | "conversion_disabled"
  | "amount_required"
  | "below_minimum"
  | "invalid_unit"
  | "daily_count_limit"
  | "weekly_count_limit"
  | "monthly_count_limit"
  | "daily_coin_limit"
  | "monthly_coin_limit"
  | "interval_limit"
  | "insufficient_store_points"
  | "credit_zero";

/**
 * P0-5 / DB-2 — 전환 미리보기 (모든 금액은 서버 계산; 화면에서 잔액을 빼거나 더하지 않는다).
 * 미리보기는 실행 보증이 아니다 — 실제 전환 RPC 가 트랜잭션 안에서 다시 검사한다.
 * 전후 값(*After, cashCreditMinor, feeSettleMinor, cashNetIncreaseMinor)은 canConvert 일 때만 숫자, 아니면 null.
 */
export type BusinessCashConversionQuote = {
  ratePesosPerPoint: number;
  version: number;
  isDefaultRate: boolean;
  effectiveFrom: string | null;
  /** 이전에 본 정책 버전과 다르면 true (버전 변경 안내 전용). */
  rateChangedNoticeRequired: boolean;
  /** F-03 policy SSOT — same DB row as rate. */
  minimumCoin: number;
  conversionUnit: number;
  conversionEnabled: boolean;
  limits: {
    maximumConversionsPerDay: number | null;
    maximumConversionsPerWeek: number | null;
    maximumConversionsPerMonth: number | null;
    dailyLimitCoin: number | null;
    monthlyLimitCoin: number | null;
    minimumIntervalHours: number | null;
  };
  usage: { dayCount: number; dayCoin: number; weekCount: number; monthCount: number; monthCoin: number };
  canConvert: boolean;
  blockers: CoinConversionBlocker[];
  requestedPoints: number;
  maxConvertible: number;
  storePointsBalance: number;
  businessCashBalanceMinor: number;
  outstandingFeeMinor: number;
  coinAfter: number | null;
  expectedBusinessCashMinor: number | null;
  feeSettleMinor: number | null;
  cashAfterMinor: number | null;
  cashNetIncreaseMinor: number | null;
};

/** Quote math from current policy — snapshot at confirm uses same version. */
export function computeBusinessCashFromStorePoints(input: {
  points: number;
  ratePesosPerPoint: number;
}): number {
  const points = Math.trunc(Number(input.points) || 0);
  const rate = Number(input.ratePesosPerPoint);
  if (points <= 0 || !Number.isFinite(rate) || rate <= 0) return 0;
  return Math.trunc(points * rate * 100);
}

export function isDefaultConversionRate(ratePesosPerPoint: number): boolean {
  return Number(ratePesosPerPoint) === BUSINESS_CASH_CONVERSION_DEFAULT_RATE_PESOS;
}
