/**
 * Recovery — Owner campaign action policy (ONE primary + secondary).
 * Lifecycle authority stays in delivery-ad-lifecycle; this is CTA presentation SSOT.
 */

import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { DeliveryAdOwnerProductKind } from "@/lib/stores/advertising/delivery-ad-owner-next-action";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import { ownerAdsShouldShowContactAdminCta } from "@/lib/stores/advertising/owner-delivery-ad-r2-operations";
import type { OwnerAdsOpsBackendCapability } from "@/lib/stores/advertising/owner-delivery-ad-r2-operations";

export type OwnerCampaignPrimaryCtaKey =
  | "owner_ads_hub_cta_continue_draft"
  | "owner_ads_hub_cta_edit"
  | "owner_ads_hub_cta_view_detail"
  | "owner_ads_hub_cta_manage_active"
  | "owner_ads_hub_cta_resume"
  | "owner_ads_hub_cta_pay"
  | "owner_ads_hub_cta_view_result"
  | "owner_ads_hub_cta_view_performance";

export type OwnerCampaignHubPrimary = {
  labelKey: OwnerCampaignPrimaryCtaKey;
  href: string;
};

export function ownerCampaignHubPrimaryCta(input: {
  lifecycleStatus: DeliveryAdLifecycleStatus;
  productKind: DeliveryAdOwnerProductKind;
  storeId: string;
  campaignId: string;
  fundingRequired?: boolean;
}): OwnerCampaignHubPrimary {
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
    case "APPROVED":
    case "SCHEDULED":
      if (input.fundingRequired) {
        return { labelKey: "owner_ads_hub_cta_pay", href: detailHref };
      }
      return { labelKey: "owner_ads_hub_cta_view_detail", href: detailHref };
    case "ACTIVE":
      return { labelKey: "owner_ads_hub_cta_manage_active", href: detailHref };
    case "PAUSED_OWNER":
      return { labelKey: "owner_ads_hub_cta_resume", href: detailHref };
    case "PAUSED_ADMIN":
      return { labelKey: "owner_ads_hub_cta_view_detail", href: detailHref };
    case "ENDED":
    case "TERMINATED":
    case "EXHAUSTED":
    case "ARCHIVED":
    case "REJECTED":
      return { labelKey: "owner_ads_hub_cta_view_result", href: detailHref };
    case "SUBMITTED":
    case "UNDER_REVIEW":
    default:
      return { labelKey: "owner_ads_hub_cta_view_detail", href: detailHref };
  }
}

/** DRAFT may delete; ACTIVE/ENDED/funded history must never delete. */
export function ownerCampaignMayDeleteDraft(
  lifecycleStatus: DeliveryAdLifecycleStatus
): boolean {
  return lifecycleStatus === "DRAFT";
}

/** Owner cancel after submit is NOT in lifecycle — never fabricate. */
export function ownerCampaignMayCancelApplication(
  _lifecycleStatus: DeliveryAdLifecycleStatus
): boolean {
  return false;
}

export function ownerCampaignContactAdminAllowed(input: {
  lifecycleStatus: DeliveryAdLifecycleStatus;
  opsCapability: OwnerAdsOpsBackendCapability;
}): boolean {
  return ownerAdsShouldShowContactAdminCta(input);
}
