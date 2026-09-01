/**
 * CUT H — Delivery Ads financial contracts.
 * PRODUCTION AUTOMATIC CHARGING is DISABLED until business pricing + attribution configured.
 * No fake CPC/CPA/window defaults.
 */

export const DELIVERY_AD_CAMPAIGN_BUDGET_TABLE = "delivery_ad_campaign_budgets" as const;
export const DELIVERY_AD_PRICING_POLICY_TABLE = "delivery_ad_pricing_policies" as const;
export const DELIVERY_AD_BILLING_POLICY_TABLE = "delivery_ad_billing_policy" as const;
export const DELIVERY_AD_CHARGE_LEDGER_TABLE = "delivery_ad_charge_ledger" as const;
export const DELIVERY_AD_REFUND_LEDGER_TABLE = "delivery_ad_refund_ledger" as const;

export const DELIVERY_AD_BILLING_CURRENCY_DEFAULT = "PHP" as const;

/** Platform launch switch — Production ships disabled. */
export const DELIVERY_AD_BILLING_PLATFORM = {
  isEnabled: false,
  status: "DISABLED" as const,
  note: "Infrastructure only. Enable only after pricing + attribution window configured.",
} as const;

export const DELIVERY_AD_ORDER_PERCENT_BASIS = {
  status: "NOT_CONFIGURED" as const,
  note: "No subtotal/post-discount/delivery-included basis chosen — ORDER_PERCENT charges fail-closed.",
} as const;

export const DELIVERY_AD_REFUND_POLICY = {
  status: "NOT_CONFIGURED" as const,
  note: "Architecture ready; do not invent cancelled=always-refund without business authority.",
} as const;

export const DELIVERY_AD_FIXED_PERIOD_BILLING = {
  status: "DEFERRED" as const,
  note: "FIXED_PERIOD vocabulary supported; scheduler not implemented in CUT H.",
} as const;

export type DeliveryAdBudgetStatus =
  | "NOT_CONFIGURED"
  | "AVAILABLE"
  | "EXHAUSTED"
  | "SUSPENDED";

/**
 * Exposure financial gate foundation.
 * BILLING_NOT_LAUNCHED must NOT block CUT D/E exposure.
 */
export const STORE_SPONSORED_BUDGET_GATE = {
  status: "BILLING_NOT_LAUNCHED" as const,
  cut: "H",
  enforcement: "off" as const,
  nullMeansUnlimited: false,
  note: "Billing platform disabled — do not treat missing budget as exhausted or unlimited spend.",
} as const;

export function buildChargeIdempotencyKey(input: {
  campaignId: string;
  pricingModel: string;
  sourceEventId: string;
  chargeKind?: string;
}): string {
  const kind = input.chargeKind ?? "USAGE";
  return `${input.campaignId}:${input.pricingModel}:${input.sourceEventId}:${kind}`;
}

export function buildRefundIdempotencyKey(input: {
  originalChargeId: string;
  sourceEventId: string;
}): string {
  return `refund:${input.originalChargeId}:${input.sourceEventId}`;
}

/** Integer minor-unit money — reject floats (reuse GiftMoneyInt semantics). */
export function assertDeliveryAdMoneyMinor(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n >= 0;
}

export function toDeliveryAdMoneyMinor(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

/**
 * ORDER_PERCENT foundation — fail-closed when basis NOT_CONFIGURED.
 * Fixture tests may pass basis explicitly.
 */
export function computeOrderPercentChargeMinor(input: {
  orderAmountMinor: number;
  percentageBasisPoints: number;
  basisConfigured: boolean;
}): { ok: true; amountMinor: number } | { ok: false; error: "basis_not_configured" | "invalid_amount" } {
  if (!input.basisConfigured) return { ok: false, error: "basis_not_configured" };
  if (!assertDeliveryAdMoneyMinor(input.orderAmountMinor)) {
    return { ok: false, error: "invalid_amount" };
  }
  if (
    !Number.isInteger(input.percentageBasisPoints) ||
    input.percentageBasisPoints < 0 ||
    input.percentageBasisPoints > 10000
  ) {
    return { ok: false, error: "invalid_amount" };
  }
  // Deterministic floor to minor units (no float drift).
  const amountMinor = Math.floor(
    (input.orderAmountMinor * input.percentageBasisPoints) / 10000
  );
  return { ok: true, amountMinor };
}

export function isAutomaticChargingAllowed(input: {
  billingEnabled: boolean;
  pricingActive: boolean;
}): boolean {
  return input.billingEnabled === true && input.pricingActive === true;
}
