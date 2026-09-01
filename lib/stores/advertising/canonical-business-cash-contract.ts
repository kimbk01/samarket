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

export type BusinessCashConversionQuote = {
  ratePesosPerPoint: number;
  version: number;
  isDefaultRate: boolean;
  effectiveFrom: string | null;
  storePointsBalance: number;
  businessCashBalanceMinor: number;
  requestedPoints: number;
  expectedBusinessCashMinor: number;
  rateChangedNoticeRequired: boolean;
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
