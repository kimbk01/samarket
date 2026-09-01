/**
 * Canonical Cash funding readiness for Delivery Ads.
 * The filename remains temporarily for import compatibility only.
 */

export const DELIVERY_AD_FUNDING_STATUSES = [
  "UNFUNDED",
  "FUNDED",
  "REFUNDED",
] as const;
export type DeliveryAdFundingStatus =
  (typeof DELIVERY_AD_FUNDING_STATUSES)[number];

export type DeliveryAdCampaignSourceForFunding =
  | "OWNER_PAID"
  | "DIBAY_FIRST_PARTY";

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
  const status = String(input.rowStatus ?? "").trim();
  if (status === "FUNDED" || status === "REFUNDED") return status;
  return "UNFUNDED";
}
