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

export type OwnerRequiredActionTone = "urgent" | "warning" | "info" | "neutral";

export type OwnerRequiredActionPresentation = {
  tone: OwnerRequiredActionTone;
  titleKey:
    | "owner_ads_ra_changes_requested_title"
    | "owner_ads_ra_waiting_title"
    | "owner_ads_ra_rejected_title"
    | "owner_ads_ra_paused_admin_title"
    | "owner_ads_ra_paused_owner_title"
    | "owner_ads_ra_active_title"
    | "owner_ads_ra_draft_title"
    | "owner_ads_ra_scheduled_title"
    | "owner_ads_ra_ended_title"
    | "owner_ads_ra_generic_title";
  bodyKey:
    | "owner_ads_ra_changes_requested_body"
    | "owner_ads_ra_waiting_body"
    | "owner_ads_ra_rejected_body"
    | "owner_ads_ra_paused_admin_body"
    | "owner_ads_ra_paused_owner_body"
    | "owner_ads_ra_active_body"
    | "owner_ads_ra_draft_body"
    | "owner_ads_ra_scheduled_body"
    | "owner_ads_ra_ended_body"
    | "owner_ads_ra_generic_body";
  /** Owner has a required task (not waiting / informational). */
  ownerTaskRequired: boolean;
  /** Show current reviewNotes snapshot when present. */
  showAdminReason: boolean;
  /** Existing edit/correct/continue href when applicable. */
  primaryHref: Extract<OwnerNextAction, { kind: "href" }> | null;
  /** Guidance-only navigation (e.g. REJECTED → hub for new application). */
  guidanceHref: { labelKey: "owner_ads_ra_rejected_cta" | "owner_ads_back_hub"; href: string } | null;
};

/**
 * Priority 4 — presentation-only required-action mapping.
 * Derived from canonical lifecycle; does not write state or invent actions.
 */
export function getOwnerDeliveryAdRequiredActionPresentation(
  input: OwnerNextActionInput
): OwnerRequiredActionPresentation {
  const status = input.lifecycleStatus;
  const editHref =
    status === "DRAFT" || status === "CHANGES_REQUESTED"
      ? ({
          kind: "href" as const,
          labelKey: "owner_ads_edit_again" as const,
          href: createEditHref(input),
        })
      : null;

  switch (status) {
    case "CHANGES_REQUESTED":
      return {
        tone: "urgent",
        titleKey: "owner_ads_ra_changes_requested_title",
        bodyKey: "owner_ads_ra_changes_requested_body",
        ownerTaskRequired: true,
        showAdminReason: true,
        primaryHref: editHref,
        guidanceHref: null,
      };
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return {
        tone: "info",
        titleKey: "owner_ads_ra_waiting_title",
        bodyKey: "owner_ads_ra_waiting_body",
        ownerTaskRequired: false,
        showAdminReason: false,
        primaryHref: null,
        guidanceHref: null,
      };
    case "REJECTED":
      return {
        tone: "warning",
        titleKey: "owner_ads_ra_rejected_title",
        bodyKey: "owner_ads_ra_rejected_body",
        ownerTaskRequired: false,
        showAdminReason: true,
        primaryHref: null,
        guidanceHref: {
          labelKey: "owner_ads_ra_rejected_cta",
          href: DELIVERY_AD_OWNER_ROUTES.hub,
        },
      };
    case "PAUSED_ADMIN":
      return {
        tone: "warning",
        titleKey: "owner_ads_ra_paused_admin_title",
        bodyKey: "owner_ads_ra_paused_admin_body",
        ownerTaskRequired: false,
        showAdminReason: true,
        primaryHref: null,
        guidanceHref: null,
      };
    case "PAUSED_OWNER":
      return {
        tone: "info",
        titleKey: "owner_ads_ra_paused_owner_title",
        bodyKey: "owner_ads_ra_paused_owner_body",
        ownerTaskRequired: false,
        showAdminReason: false,
        primaryHref: null,
        guidanceHref: null,
      };
    case "ACTIVE":
      return {
        tone: "neutral",
        titleKey: "owner_ads_ra_active_title",
        bodyKey: "owner_ads_ra_active_body",
        ownerTaskRequired: false,
        showAdminReason: false,
        primaryHref: null,
        guidanceHref: null,
      };
    case "DRAFT":
      return {
        tone: "info",
        titleKey: "owner_ads_ra_draft_title",
        bodyKey: "owner_ads_ra_draft_body",
        ownerTaskRequired: true,
        showAdminReason: false,
        primaryHref: editHref,
        guidanceHref: null,
      };
    case "APPROVED":
    case "SCHEDULED":
      return {
        tone: "info",
        titleKey: "owner_ads_ra_scheduled_title",
        bodyKey: "owner_ads_ra_scheduled_body",
        ownerTaskRequired: false,
        showAdminReason: false,
        primaryHref: null,
        guidanceHref: null,
      };
    case "ENDED":
    case "TERMINATED":
    case "EXHAUSTED":
    case "ARCHIVED":
      return {
        tone: "neutral",
        titleKey: "owner_ads_ra_ended_title",
        bodyKey: "owner_ads_ra_ended_body",
        ownerTaskRequired: false,
        showAdminReason: false,
        primaryHref: null,
        guidanceHref: null,
      };
    default: {
      const _exhaustive: never = status;
      void _exhaustive;
      return {
        tone: "neutral",
        titleKey: "owner_ads_ra_generic_title",
        bodyKey: "owner_ads_ra_generic_body",
        ownerTaskRequired: false,
        showAdminReason: false,
        primaryHref: null,
        guidanceHref: null,
      };
    }
  }
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
