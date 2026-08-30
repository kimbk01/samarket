/**
 * Priority 5 / R2 — Admin Delivery Ads required-decision presentation.
 * Derived from canonical lifecycle + existing adminActionAllowed (+ optional Banner creative).
 * Does not write state or invent queue/lifecycle authority.
 */

import {
  adminActionAllowed,
  type AdminDeliveryAdAction,
} from "@/lib/stores/advertising/admin-delivery-ad-contract";
import { isAdminBannerNeedsCreativeProduction } from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import type { DeliveryAdLifecycleStatus } from "@/lib/stores/advertising/delivery-ad-lifecycle";
import type { DeliveryAdProductKind } from "@/lib/stores/advertising/delivery-ad-domain";

export type AdminRequiredDecisionTone = "urgent" | "info" | "neutral";

const REVIEW_ACTIONS: AdminDeliveryAdAction[] = [
  "start_review",
  "approve",
  "request_changes",
  "reject",
];

export type AdminRequiredDecisionPresentation = {
  tone: AdminRequiredDecisionTone;
  titleKey:
    | "admin_delivery_ads_rd_review_title"
    | "admin_delivery_ads_rd_needs_creative_title"
    | "admin_delivery_ads_rd_waiting_owner_title"
    | "admin_delivery_ads_rd_paused_admin_title"
    | "admin_delivery_ads_rd_none_title";
  bodyKey:
    | "admin_delivery_ads_rd_review_body"
    | "admin_delivery_ads_rd_needs_creative_body"
    | "admin_delivery_ads_rd_waiting_owner_body"
    | "admin_delivery_ads_rd_paused_admin_body"
    | "admin_delivery_ads_rd_none_body";
  /** True only when Admin must make a lifecycle review decision now. */
  decisionRequired: boolean;
  /** Banner needs Admin production before approve path. */
  needsCreativeProduction: boolean;
  /** Canonical review CTAs currently allowed (subset of existing actions). */
  primaryReviewActions: AdminDeliveryAdAction[];
};

/**
 * Presentation-only mapping. Exhaustive on lifecycle; never invents actions.
 */
export function getAdminDeliveryAdRequiredDecisionPresentation(
  lifecycleStatus: DeliveryAdLifecycleStatus,
  opts?: {
    productKind?: DeliveryAdProductKind | null;
    creativeAssetPath?: string | null;
  }
): AdminRequiredDecisionPresentation {
  const primaryReviewActions = REVIEW_ACTIONS.filter((a) =>
    adminActionAllowed(a, lifecycleStatus)
  );
  const needsCreativeProduction = isAdminBannerNeedsCreativeProduction({
    productKind: opts?.productKind ?? "",
    creativeAssetPath: opts?.creativeAssetPath,
  });
  const decisionRequired =
    lifecycleStatus === "SUBMITTED" || lifecycleStatus === "UNDER_REVIEW";

  if (
    needsCreativeProduction &&
    (lifecycleStatus === "SUBMITTED" ||
      lifecycleStatus === "UNDER_REVIEW" ||
      lifecycleStatus === "APPROVED" ||
      lifecycleStatus === "SCHEDULED")
  ) {
    return {
      tone: "urgent",
      titleKey: "admin_delivery_ads_rd_needs_creative_title",
      bodyKey: "admin_delivery_ads_rd_needs_creative_body",
      decisionRequired,
      needsCreativeProduction: true,
      primaryReviewActions: decisionRequired ? primaryReviewActions : [],
    };
  }

  switch (lifecycleStatus) {
    case "SUBMITTED":
    case "UNDER_REVIEW":
      return {
        tone: "urgent",
        titleKey: "admin_delivery_ads_rd_review_title",
        bodyKey: "admin_delivery_ads_rd_review_body",
        decisionRequired: true,
        needsCreativeProduction: false,
        primaryReviewActions,
      };
    case "CHANGES_REQUESTED":
      return {
        tone: "info",
        titleKey: "admin_delivery_ads_rd_waiting_owner_title",
        bodyKey: "admin_delivery_ads_rd_waiting_owner_body",
        decisionRequired: false,
        needsCreativeProduction: false,
        primaryReviewActions: [],
      };
    case "PAUSED_ADMIN":
      return {
        tone: "info",
        titleKey: "admin_delivery_ads_rd_paused_admin_title",
        bodyKey: "admin_delivery_ads_rd_paused_admin_body",
        decisionRequired: false,
        needsCreativeProduction: false,
        primaryReviewActions: [],
      };
    default:
      return {
        tone: "neutral",
        titleKey: "admin_delivery_ads_rd_none_title",
        bodyKey: "admin_delivery_ads_rd_none_body",
        decisionRequired: false,
        needsCreativeProduction: false,
        primaryReviewActions: [],
      };
  }
}

/** Queue case status → human label key (presentation only). */
export function adminDeliveryAdOpsCaseStatusLabelKey(
  status: string
):
  | "admin_delivery_ads_case_waiting_admin"
  | "admin_delivery_ads_case_waiting_owner"
  | "admin_delivery_ads_case_resolved"
  | "admin_delivery_ads_case_generic" {
  if (status === "WAITING_ADMIN") return "admin_delivery_ads_case_waiting_admin";
  if (status === "WAITING_OWNER") return "admin_delivery_ads_case_waiting_owner";
  if (status === "RESOLVED") return "admin_delivery_ads_case_resolved";
  return "admin_delivery_ads_case_generic";
}

export function adminDeliveryAdLifecycleLabelKey(status: string): string {
  return `admin_delivery_ads_lifecycle_${status.toLowerCase()}`;
}
