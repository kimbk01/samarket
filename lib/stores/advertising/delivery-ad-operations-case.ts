/**
 * PRODUCT CUT 3-A — Delivery Ads operations Case identity + status vocabulary.
 * Campaign app key = (productKind, campaignId); DB uses dual nullable FKs.
 */

import type { DeliveryAdProductKind } from "@/lib/stores/advertising/delivery-ad-domain";
import { isDeliveryAdProductKind } from "@/lib/stores/advertising/delivery-ad-domain";

export const DELIVERY_AD_OPERATIONS_CASE_TABLE = "delivery_ad_operations_cases" as const;
export const DELIVERY_AD_OPERATIONS_THREAD_TABLE = "delivery_ad_operations_threads" as const;

export const DELIVERY_AD_OPERATIONS_CASE_STATUSES = [
  "OPEN",
  "WAITING_OWNER",
  "WAITING_ADMIN",
  "RESOLVED",
] as const;
export type DeliveryAdOperationsCaseStatus =
  (typeof DELIVERY_AD_OPERATIONS_CASE_STATUSES)[number];

export type DeliveryAdCampaignIdentity =
  | { productKind: "store_sponsored"; campaignId: string }
  | { productKind: "banner"; campaignId: string };

export type DeliveryAdOperationsCaseRow = {
  id: string;
  productKind: DeliveryAdProductKind;
  storeSponsoredCampaignId: string | null;
  bannerCampaignId: string | null;
  ownerUserId: string;
  status: DeliveryAdOperationsCaseStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  threadId: string | null;
};

export type DeliveryAdOperationsThreadRow = {
  id: string;
  caseId: string;
  createdAt: string;
  updatedAt: string;
};

export function isDeliveryAdOperationsCaseStatus(
  value: unknown
): value is DeliveryAdOperationsCaseStatus {
  return (
    typeof value === "string" &&
    (DELIVERY_AD_OPERATIONS_CASE_STATUSES as readonly string[]).includes(value)
  );
}

export function parseDeliveryAdCampaignIdentity(input: {
  productKind: unknown;
  campaignId: unknown;
}): DeliveryAdCampaignIdentity | null {
  if (!isDeliveryAdProductKind(input.productKind)) return null;
  const campaignId = typeof input.campaignId === "string" ? input.campaignId.trim() : "";
  if (!campaignId) return null;
  if (input.productKind === "store_sponsored") {
    return { productKind: "store_sponsored", campaignId };
  }
  return { productKind: "banner", campaignId };
}

/** Map app identity → DB FK columns (CHECK-compatible). */
export function campaignIdentityToCaseFkColumns(identity: DeliveryAdCampaignIdentity): {
  product_kind: DeliveryAdProductKind;
  store_sponsored_campaign_id: string | null;
  banner_campaign_id: string | null;
} {
  if (identity.productKind === "store_sponsored") {
    return {
      product_kind: "store_sponsored",
      store_sponsored_campaign_id: identity.campaignId,
      banner_campaign_id: null,
    };
  }
  return {
    product_kind: "banner",
    store_sponsored_campaign_id: null,
    banner_campaign_id: identity.campaignId,
  };
}

export function campaignIdFromCaseRow(row: {
  productKind: DeliveryAdProductKind;
  storeSponsoredCampaignId: string | null;
  bannerCampaignId: string | null;
}): string | null {
  if (row.productKind === "store_sponsored") {
    return row.storeSponsoredCampaignId;
  }
  return row.bannerCampaignId;
}
