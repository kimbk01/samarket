/**
 * Stage 1 — Delivery Ads Store Cash finance authority SSOT.
 * ADS_SPEND_AUTHORITY = store_cash_accounts / store_cash_ledger (AD_SPEND / AD_REFUND).
 * Legacy delivery_ad Business Cash = MIGRATE (not new write authority).
 */

export const DELIVERY_AD_STORE_CASH_SPENDS_TABLE =
  "delivery_ad_store_cash_spends" as const;

export const STORE_CASH_DELIVERY_AD_SPEND_RPC =
  "store_cash_delivery_ad_spend" as const;
export const STORE_CASH_DELIVERY_AD_REFUND_RPC =
  "store_cash_delivery_ad_refund" as const;

export const DELIVERY_AD_PAYMENT_MODEL = {
  id: "DEBIT_REFUND" as const,
  rule:
    "VALID submit → Store Cash AD_SPEND exactly once → SUBMITTED; terminal REJECT → AD_REFUND exactly once; CHANGES_REQUESTED/RESUBMIT preserve funds (no refund, no second debit)",
} as const;

export const DELIVERY_AD_STORE_CASH_SPEND_STATUSES = ["SECURED", "REFUNDED"] as const;
export type DeliveryAdStoreCashSpendStatus =
  (typeof DELIVERY_AD_STORE_CASH_SPEND_STATUSES)[number];

/** Map Store Cash spend mark → legacy funding-status vocabulary used by exposure gates. */
export function resolveFundingStatusFromStoreCashSpend(
  status: string | null | undefined
): "UNFUNDED" | "FUNDED" | "REFUNDED" {
  const s = String(status ?? "").trim();
  if (s === "SECURED") return "FUNDED";
  if (s === "REFUNDED") return "REFUNDED";
  return "UNFUNDED";
}

export function isDeliveryAdStoreCashSecuredForGoLive(input: {
  campaignSource: string | null | undefined;
  spendStatus: string | null | undefined;
}): boolean {
  const source = String(input.campaignSource ?? "OWNER_PAID").trim();
  if (source === "DIBAY_FIRST_PARTY") return true;
  return String(input.spendStatus ?? "").trim() === "SECURED";
}

/** Legacy Business Cash product paths — no new funding authority. */
export const DELIVERY_AD_BUSINESS_CASH_LEGACY = {
  classification: "MIGRATION_SOURCE" as const,
  chargeRequestProduct: "DISABLED_FOR_NEW_PRODUCT" as const,
  ownerFundRpc: "LEGACY_READ_ONLY" as const,
  note: "Do not use for new ad payments. Tables preserved; no balance transfer in Stage 1.",
} as const;

export type InsufficientStoreCashPayload = {
  error: "INSUFFICIENT_STORE_CASH";
  availablePhp: number;
  requiredPhp: number;
  shortagePhp: number;
  availableMinor: number;
  requiredMinor: number;
  shortageMinor: number;
  currency: string;
};

export function parseInsufficientStoreCashRpc(
  payload: Record<string, unknown> | null | undefined
): InsufficientStoreCashPayload | null {
  if (!payload || payload.error !== "INSUFFICIENT_STORE_CASH") return null;
  const availablePhp = Math.trunc(Number(payload.available_php) || 0);
  const requiredPhp = Math.trunc(Number(payload.required_php) || 0);
  const shortagePhp = Math.trunc(Number(payload.shortage_php) || Math.max(0, requiredPhp - availablePhp));
  return {
    error: "INSUFFICIENT_STORE_CASH",
    availablePhp,
    requiredPhp,
    shortagePhp,
    availableMinor: Math.trunc(Number(payload.available_minor) || availablePhp * 100),
    requiredMinor: Math.trunc(Number(payload.required_minor) || requiredPhp * 100),
    shortageMinor: Math.trunc(Number(payload.shortage_minor) || shortagePhp * 100),
    currency: String(payload.currency ?? "PHP"),
  };
}
