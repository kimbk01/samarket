/**
 * PRODUCT CUT 1 — Owner next-action SSOT (lifecycle × productKind).
 * Routes and actions must match real edit/API contracts.
 */

import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { canOwnerRequestLifecycleTransition } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import { DELIVERY_AD_OWNER_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";
import type { OwnerCampaignAction } from "@/lib/stores/advertising/owner-store-sponsored-contract";
import { ownerActionTargetLifecycle } from "@/lib/stores/advertising/owner-store-sponsored-contract";

export type DeliveryAdOwnerProductKind = "store_sponsored" | "banner";

export type OwnerNextActionI18nKey =
  | "owner_ads_edit_again"
  | "owner_ads_action_submit"
  | "owner_ads_action_resubmit"
  | "owner_ads_action_pause"
  | "owner_ads_action_resume"
  | "owner_ads_action_end"
  | "owner_ads_action_delete"
  | "owner_ads_view_detail";

export type OwnerNextAction =
  | {
      kind: "href";
      labelKey: OwnerNextActionI18nKey;
      href: string;
    }
  | {
      kind: "action";
      labelKey: OwnerNextActionI18nKey;
      action: OwnerCampaignAction | "delete";
      tone?: "danger";
    };

export type OwnerNextActionInput = {
  lifecycleStatus: DeliveryAdLifecycleStatus;
  productKind: DeliveryAdOwnerProductKind;
  storeId: string;
  campaignId: string;
};

function createEditHref(input: OwnerNextActionInput): string {
  const base =
    input.productKind === "banner"
      ? DELIVERY_AD_OWNER_ROUTES.createBanner
      : DELIVERY_AD_OWNER_ROUTES.createStoreSponsored;
  const qs = new URLSearchParams({
    storeId: input.storeId,
    campaignId: input.campaignId,
  });
  return `${base}?${qs.toString()}`;
}

function canOwnerAction(
  lifecycle: DeliveryAdLifecycleStatus,
  action: OwnerCampaignAction
): boolean {
  const target = ownerActionTargetLifecycle(action);
  if (!target) return action === "delete" && lifecycle === "DRAFT";
  return canOwnerRequestLifecycleTransition(lifecycle, target);
}

/**
 * Ordered CTAs for detail footer / hub one-liner.
 * PAUSED_ADMIN: no Owner resume (admin-only).
 */
export function ownerDeliveryAdNextActions(input: OwnerNextActionInput): OwnerNextAction[] {
  const { lifecycleStatus: status } = input;
  const out: OwnerNextAction[] = [];

  if (status === "DRAFT" || status === "CHANGES_REQUESTED") {
    out.push({
      kind: "href",
      labelKey: "owner_ads_edit_again",
      href: createEditHref(input),
    });
  }

  if (status === "DRAFT" && canOwnerAction(status, "submit")) {
    out.push({
      kind: "action",
      labelKey: "owner_ads_action_submit",
      action: "submit",
    });
  }

  if (status === "CHANGES_REQUESTED" && canOwnerAction(status, "resubmit")) {
    out.push({
      kind: "action",
      labelKey: "owner_ads_action_resubmit",
      action: "resubmit",
    });
  }

  if (status === "DRAFT") {
    out.push({
      kind: "action",
      labelKey: "owner_ads_action_delete",
      action: "delete",
      tone: "danger",
    });
  }

  if (status === "ACTIVE" && canOwnerAction(status, "pause")) {
    out.push({
      kind: "action",
      labelKey: "owner_ads_action_pause",
      action: "pause",
    });
  }

  if (status === "ACTIVE" && canOwnerAction(status, "end")) {
    out.push({
      kind: "action",
      labelKey: "owner_ads_action_end",
      action: "end",
      tone: "danger",
    });
  }

  if (status === "PAUSED_OWNER" && canOwnerAction(status, "resume")) {
    out.push({
      kind: "action",
      labelKey: "owner_ads_action_resume",
      action: "resume",
    });
  }

  if (status === "PAUSED_OWNER" && canOwnerAction(status, "end")) {
    out.push({
      kind: "action",
      labelKey: "owner_ads_action_end",
      action: "end",
      tone: "danger",
    });
  }

  // PAUSED_ADMIN: intentionally no resume/edit CTAs
  return out;
}

/** One primary next-action for list rows (href preferred, else first action label). */
export function ownerDeliveryAdPrimaryNextAction(
  input: OwnerNextActionInput
): OwnerNextAction | null {
  const actions = ownerDeliveryAdNextActions(input);
  const href = actions.find((a) => a.kind === "href");
  if (href) return href;
  return actions[0] ?? null;
}

export function ownerDeliveryAdDetailHref(input: {
  campaignId: string;
  storeId: string;
  productKind: DeliveryAdOwnerProductKind;
}): string {
  const qs = new URLSearchParams({ storeId: input.storeId });
  if (input.productKind === "banner") qs.set("product", "banner");
  return `${DELIVERY_AD_OWNER_ROUTES.detail(input.campaignId)}?${qs.toString()}`;
}
