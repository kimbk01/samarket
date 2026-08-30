/**
 * Business Cash funding gate (P1) — Owner Delivery Ad prepaid funding SSOT.
 * NOT D-Point / Business Credit / CUT H usage billing.
 * MODEL B: OWNER_PAID may be SCHEDULED unfunded; ACTIVE requires FUNDED.
 */

export const DELIVERY_AD_BUSINESS_CASH_LEDGER_TABLE =
  "delivery_ad_business_cash_ledger" as const;
export const DELIVERY_AD_CAMPAIGN_FUNDINGS_TABLE =
  "delivery_ad_campaign_fundings" as const;

export const OWNER_FUND_DELIVERY_AD_CAMPAIGN_RPC =
  "owner_fund_delivery_ad_campaign" as const;
export const ADMIN_BUSINESS_CASH_CREDIT_RPC =
  "admin_delivery_ad_business_cash_credit" as const;
export const ADMIN_REFUND_DELIVERY_AD_FUNDING_RPC =
  "admin_refund_delivery_ad_campaign_funding" as const;

export const DELIVERY_AD_FUNDING_MODEL = {
  id: "MODEL_B_ACTIVATION_GATE" as const,
  rule: "OWNER_PAID requires FUNDED before ACTIVE; SCHEDULED may be unfunded; DIBAY_FIRST_PARTY exempt",
} as const;

export const DELIVERY_AD_BUSINESS_CASH_PLATFORM = {
  externalTopUp: "NOT_IMPLEMENTED_PRESERVED" as const,
  adminCredit: "IMPLEMENTED" as const,
  cutHBilling: "PRESERVED_DISABLED" as const,
  note: "Prepaid Business Cash ledger only. No payment gateway in this CUT.",
} as const;

export const DELIVERY_AD_BUSINESS_CASH_ENTRY_KINDS = [
  "TOP_UP",
  "AD_FUNDING_DEBIT",
  "AD_REFUND",
  "ADMIN_CREDIT",
  "ADMIN_DEBIT",
] as const;

export type DeliveryAdBusinessCashEntryKind =
  (typeof DELIVERY_AD_BUSINESS_CASH_ENTRY_KINDS)[number];

export const DELIVERY_AD_FUNDING_STATUSES = ["UNFUNDED", "FUNDED", "REFUNDED"] as const;
export type DeliveryAdFundingStatus = (typeof DELIVERY_AD_FUNDING_STATUSES)[number];

export type DeliveryAdCampaignSourceForFunding = "OWNER_PAID" | "DIBAY_FIRST_PARTY";

/** Customer + ACTIVE gate readiness — one SSOT. */
export function isDeliveryAdFundingReadyForGoLive(input: {
  campaignSource: string | null | undefined;
  fundingStatus: DeliveryAdFundingStatus | null | undefined;
}): boolean {
  const source = String(input.campaignSource ?? "OWNER_PAID").trim();
  if (source === "DIBAY_FIRST_PARTY") return true;
  return input.fundingStatus === "FUNDED";
}

export function resolveDeliveryAdFundingStatus(input: {
  rowStatus: string | null | undefined;
}): DeliveryAdFundingStatus {
  const s = String(input.rowStatus ?? "").trim();
  if (s === "FUNDED" || s === "REFUNDED") return s;
  return "UNFUNDED";
}

export function buildOwnerFundIdempotencyKey(input: {
  ownerUserId: string;
  productKind: string;
  campaignId: string;
}): string {
  return `fund:${input.ownerUserId}:${input.productKind}:${input.campaignId}`;
}

export function buildAdminCashCreditIdempotencyKey(input: {
  adminUserId: string;
  ownerUserId: string;
  amountMinor: number;
  nonce: string;
}): string {
  return `admin_credit:${input.adminUserId}:${input.ownerUserId}:${input.amountMinor}:${input.nonce}`;
}

export function buildAdminFundingRefundIdempotencyKey(input: {
  campaignId: string;
  productKind: string;
  fundingLedgerId: string;
}): string {
  return `refund_funding:${input.productKind}:${input.campaignId}:${input.fundingLedgerId}`;
}

/** Integer minor-unit money — reject floats. */
export function assertBusinessCashMoneyMinor(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n > 0;
}
