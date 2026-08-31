/**
 * LEGACY Business Cash tables/RPCs — MIGRATION_SOURCE only (Stage 1).
 * New ads payment authority = Store Cash AD_SPEND/AD_REFUND
 * (`delivery-ad-store-cash-contract.ts`). Do not use for new write product paths.
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

/** @deprecated Stage 1 — replaced by DEBIT_REFUND Store Cash. Kept for test/history strings. */
export const DELIVERY_AD_FUNDING_MODEL = {
  id: "MODEL_B_ACTIVATION_GATE" as const,
  supersededBy: "DEBIT_REFUND_STORE_CASH" as const,
  rule: "LEGACY — do not use for new product. Stage 1: Store Cash debit at submit.",
  status: "LEGACY_READ_ONLY" as const,
} as const;

export const DELIVERY_AD_BUSINESS_CASH_PLATFORM = {
  externalTopUp: "NOT_IMPLEMENTED_PRESERVED" as const,
  adminCredit: "LEGACY_READ_ONLY" as const,
  cutHBilling: "PRESERVED_DISABLED" as const,
  chargeRequest: "DISABLED_FOR_NEW_PRODUCT" as const,
  note: "MIGRATE — tables preserved; new ad payments use Store Cash.",
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

/**
 * Customer + ACTIVE gate readiness.
 * Stage 1: `fundingStatus` is mapped from Store Cash spend (SECURED → FUNDED).
 */
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
