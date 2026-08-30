/**
 * R1 — Owner Delivery Ads commercial application presentation SSOT.
 * Presentation only: panel gates, hub CTAs, funding error copy. No authority mutation.
 */

import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { DeliveryAdOwnerProductKind } from "@/lib/stores/advertising/delivery-ad-owner-next-action";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";

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

/** Lifecycle → which detail panels may mount. Operations never in R1 (CUT3 fail-closed). */
export function ownerAdsDetailPanelsForLifecycle(
  status: DeliveryAdLifecycleStatus
): ReadonlySet<OwnerAdsDetailPanel> {
  switch (status) {
    case "DRAFT":
      return new Set(["identity", "required_action"]);
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return new Set(["identity", "required_action", "commercial_summary", "preview"]);
    case "CHANGES_REQUESTED":
      return new Set([
        "identity",
        "required_action",
        "admin_reason",
        "commercial_summary",
        "preview",
      ]);
    case "APPROVED":
    case "SCHEDULED":
      return new Set(["identity", "required_action", "commercial_summary", "preview", "funding"]);
    case "ACTIVE":
      return new Set([
        "identity",
        "required_action",
        "commercial_summary",
        "preview",
        "funding",
        "performance",
      ]);
    case "PAUSED_OWNER":
    case "PAUSED_ADMIN":
      return new Set(["identity", "required_action", "commercial_summary", "preview", "funding"]);
    case "ENDED":
    case "TERMINATED":
    case "EXHAUSTED":
    case "ARCHIVED":
      return new Set(["identity", "required_action", "commercial_summary", "performance"]);
    case "REJECTED":
      return new Set(["identity", "required_action", "admin_reason", "commercial_summary"]);
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

export type OwnerHubCardCtaKey =
  | "owner_ads_hub_cta_continue_draft"
  | "owner_ads_hub_cta_edit"
  | "owner_ads_hub_cta_view_detail"
  | "owner_ads_hub_cta_view_performance"
  | "owner_ads_hub_cta_view_result";

export function ownerAdsHubCardPrimaryCta(input: {
  lifecycleStatus: DeliveryAdLifecycleStatus;
  productKind: DeliveryAdOwnerProductKind;
  storeId: string;
  campaignId: string;
}): { labelKey: OwnerHubCardCtaKey; href: string } {
  const detailQs = new URLSearchParams({
    storeId: input.storeId,
    product: input.productKind === "banner" ? "banner" : "store_sponsored",
  });
  const detailHref = `${DELIVERY_AD_OWNER_ROUTES.detail(input.campaignId)}?${detailQs.toString()}`;
  const editBase =
    input.productKind === "banner"
      ? DELIVERY_AD_OWNER_ROUTES.createBanner
      : DELIVERY_AD_OWNER_ROUTES.createStoreSponsored;
  const editHref = `${editBase}?${new URLSearchParams({
    storeId: input.storeId,
    campaignId: input.campaignId,
  }).toString()}`;

  switch (input.lifecycleStatus) {
    case "DRAFT":
      return { labelKey: "owner_ads_hub_cta_continue_draft", href: editHref };
    case "CHANGES_REQUESTED":
      return { labelKey: "owner_ads_hub_cta_edit", href: editHref };
    case "ACTIVE":
      return { labelKey: "owner_ads_hub_cta_view_performance", href: detailHref };
    case "ENDED":
    case "TERMINATED":
    case "EXHAUSTED":
    case "ARCHIVED":
    case "REJECTED":
      return { labelKey: "owner_ads_hub_cta_view_result", href: detailHref };
    default:
      return { labelKey: "owner_ads_hub_cta_view_detail", href: detailHref };
  }
}

/** R1: Owner ops UI must not mount while CUT3 is paused/unavailable. */
export const OWNER_ADS_R1_OPERATIONS_PANEL_ENABLED = false as const;
