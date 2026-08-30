/**
 * R2 — Admin Action Queue presentation mapper (buckets + primary CTA labels).
 * Derived from canonical lifecycle + banner creative readiness only.
 * Does not invent a queue table or mutate lifecycle.
 */

import {
  isAdminBannerNeedsCreativeProduction,
  storeSponsoredRequiresBannerCreative,
} from "@/lib/stores/advertising/delivery-ad-banner-creative-readiness";
import type { DeliveryAdProductKind } from "@/lib/stores/advertising/delivery-ad-domain";

export const ADMIN_DELIVERY_AD_ACTION_QUEUE_BUCKETS = [
  "new_application",
  "resubmit",
  "needs_creative",
  "awaiting_review",
] as const;
export type AdminDeliveryAdActionQueueBucket =
  (typeof ADMIN_DELIVERY_AD_ACTION_QUEUE_BUCKETS)[number];

export type AdminDeliveryAdActionQueueCta =
  | "review"
  | "produce_banner"
  | "re_review";

export type AdminDeliveryAdActionQueuePresentation = {
  bucket: AdminDeliveryAdActionQueueBucket;
  cta: AdminDeliveryAdActionQueueCta;
  bucketLabelKey:
    | "admin_delivery_ads_aq_bucket_new_application"
    | "admin_delivery_ads_aq_bucket_resubmit"
    | "admin_delivery_ads_aq_bucket_needs_creative"
    | "admin_delivery_ads_aq_bucket_awaiting_review";
  ctaLabelKey:
    | "admin_delivery_ads_aq_cta_review"
    | "admin_delivery_ads_aq_cta_produce_banner"
    | "admin_delivery_ads_aq_cta_re_review";
};

/**
 * Presentation-only. Store Promotion never maps to 제작 필요 from creative.
 * Optional `hadChangesRequested` distinguishes 신규 신청 vs 수정 재제출 when
 * lifecycle is SUBMITTED (e.g. non-empty prior review notes).
 */
export function mapAdminDeliveryAdActionQueuePresentation(input: {
  productKind: DeliveryAdProductKind;
  lifecycleStatus: string | null | undefined;
  creativeAssetPath?: string | null;
  /** True when Owner resubmitted after Admin CHANGES_REQUESTED (soft signal). */
  hadChangesRequested?: boolean;
}): AdminDeliveryAdActionQueuePresentation {
  void storeSponsoredRequiresBannerCreative();
  const lifecycle = String(input.lifecycleStatus ?? "").trim();
  const needsCreative = isAdminBannerNeedsCreativeProduction({
    productKind: input.productKind,
    creativeAssetPath: input.creativeAssetPath,
  });

  if (needsCreative) {
    return {
      bucket: "needs_creative",
      cta: "produce_banner",
      bucketLabelKey: "admin_delivery_ads_aq_bucket_needs_creative",
      ctaLabelKey: "admin_delivery_ads_aq_cta_produce_banner",
    };
  }

  if (lifecycle === "SUBMITTED" && input.hadChangesRequested) {
    return {
      bucket: "resubmit",
      cta: "re_review",
      bucketLabelKey: "admin_delivery_ads_aq_bucket_resubmit",
      ctaLabelKey: "admin_delivery_ads_aq_cta_re_review",
    };
  }

  if (lifecycle === "SUBMITTED") {
    return {
      bucket: "new_application",
      cta: "review",
      bucketLabelKey: "admin_delivery_ads_aq_bucket_new_application",
      ctaLabelKey: "admin_delivery_ads_aq_cta_review",
    };
  }

  if (lifecycle === "UNDER_REVIEW") {
    return {
      bucket: "awaiting_review",
      cta: "review",
      bucketLabelKey: "admin_delivery_ads_aq_bucket_awaiting_review",
      ctaLabelKey: "admin_delivery_ads_aq_cta_review",
    };
  }

  // WAITING_ADMIN residual (ops case) — default to awaiting review CTA.
  return {
    bucket: "awaiting_review",
    cta: "review",
    bucketLabelKey: "admin_delivery_ads_aq_bucket_awaiting_review",
    ctaLabelKey: "admin_delivery_ads_aq_cta_review",
  };
}
