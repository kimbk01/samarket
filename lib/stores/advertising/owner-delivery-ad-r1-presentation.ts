/**
 * R1 — Owner Delivery Ads commercial application presentation SSOT.
 * Presentation only: panel gates, hub CTAs, funding error copy. No authority mutation.
 */

import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { DeliveryAdOwnerProductKind } from "@/lib/stores/advertising/delivery-ad-owner-next-action";
import {
  ownerCampaignHubPrimaryCta,
  type OwnerCampaignPrimaryCtaKey,
} from "@/lib/stores/advertising/owner-campaign-action-policy";

export type OwnerAdsDetailPanel =
  | "identity"
  | "required_action"
  | "admin_reason"
  | "commercial_summary"
  | "preview"
  | "funding"
  | "performance"
  | "history"
  | "operations";

/** Lifecycle → which detail panels may mount. */
export function ownerAdsDetailPanelsForLifecycle(
  status: DeliveryAdLifecycleStatus
): ReadonlySet<OwnerAdsDetailPanel> {
  switch (status) {
    case "DRAFT":
      return new Set(["identity", "required_action"]);
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return new Set([
        "identity",
        "required_action",
        "commercial_summary",
        "preview",
        "funding",
        "history",
        "operations",
      ]);
    case "CHANGES_REQUESTED":
      return new Set([
        "identity",
        "required_action",
        "admin_reason",
        "commercial_summary",
        "preview",
        "funding",
        "history",
        "operations",
      ]);
    case "APPROVED":
    case "SCHEDULED":
      return new Set([
        "identity",
        "required_action",
        "commercial_summary",
        "preview",
        "funding",
        "history",
        "operations",
      ]);
    case "ACTIVE":
      return new Set([
        "identity",
        "required_action",
        "commercial_summary",
        "preview",
        "funding",
        "performance",
        "history",
        "operations",
      ]);
    case "PAUSED_OWNER":
    case "PAUSED_ADMIN":
      return new Set([
        "identity",
        "required_action",
        "commercial_summary",
        "preview",
        "funding",
        "history",
        "operations",
      ]);
    case "ENDED":
    case "TERMINATED":
    case "EXHAUSTED":
    case "ARCHIVED":
      return new Set([
        "identity",
        "required_action",
        "commercial_summary",
        "performance",
        "history",
      ]);
    case "REJECTED":
      return new Set([
        "identity",
        "required_action",
        "admin_reason",
        "commercial_summary",
        "funding",
        "history",
      ]);
    default:
      return new Set(["identity", "required_action"]);
  }
}

export function ownerAdsShouldShowFundingPanel(input: {
  lifecycleStatus: DeliveryAdLifecycleStatus;
  finalPayableMinor: number | null | undefined;
  hasPricedSnapshot: boolean;
}): boolean {
  const panels = ownerAdsDetailPanelsForLifecycle(input.lifecycleStatus);
  if (!panels.has("funding")) return false;
  if (!input.hasPricedSnapshot) return false;
  if (input.finalPayableMinor == null || input.finalPayableMinor <= 0) return false;
  return true;
}

/** Map funding/RPC machine codes to Owner-safe copy keys (never render raw codes). */
export function ownerAdsFundingErrorI18nKey(
  code: string | null | undefined
):
  | "owner_ads_funding_insufficient"
  | "owner_ads_funding_err_snapshot"
  | "owner_ads_funding_err_generic" {
  const c = String(code ?? "").trim();
  if (c === "insufficient_balance") return "owner_ads_funding_insufficient";
  if (c === "snapshot_missing" || c === "snapshot_not_priced" || c === "invalid_payable") {
    return "owner_ads_funding_err_snapshot";
  }
  return "owner_ads_funding_err_generic";
}

export type OwnerHubCardCtaKey = OwnerCampaignPrimaryCtaKey;

export function ownerAdsHubCardPrimaryCta(input: {
  lifecycleStatus: DeliveryAdLifecycleStatus;
  productKind: DeliveryAdOwnerProductKind;
  storeId: string;
  campaignId: string;
  fundingRequired?: boolean;
}): { labelKey: OwnerHubCardCtaKey; href: string } {
  const primary = ownerCampaignHubPrimaryCta(input);
  return { labelKey: primary.labelKey, href: primary.href };
}

/** R1: Owner ops UI must not mount while CUT3 is paused/unavailable. */
export const OWNER_ADS_R1_OPERATIONS_PANEL_ENABLED = false as const;
