/**
 * Admin Banner creative + destination readiness SSOT.
 * Placeholder `delivery-ads/pending/admin-production` is never publishable.
 */

import { OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET } from "@/lib/stores/advertising/owner-delivery-ad-commercial-bind";

export const DELIVERY_BANNER_CREATIVE_READINESS = {
  pendingAssetPath: OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET,
} as const;

export type DeliveryBannerCreativeReadinessReason =
  | "creative_missing"
  | "creative_placeholder"
  | "destination_missing"
  | "destination_invalid";

export function isDeliveryBannerPendingCreativeAsset(
  assetPath: string | null | undefined
): boolean {
  const a = String(assetPath ?? "").trim();
  return !a || a === OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET;
}

/** Final publishable Banner image — not null/empty/pending placeholder. */
export function isDeliveryBannerCreativeAssetReady(
  assetPath: string | null | undefined
): boolean {
  const a = String(assetPath ?? "").trim();
  if (!a) return false;
  if (a === OWNER_BANNER_ADMIN_PRODUCTION_PENDING_ASSET) return false;
  return true;
}

/** Destination: non-empty internal path starting with / (Owner/Admin CTA href shape). */
export function isDeliveryBannerDestinationReady(
  ctaHref: string | null | undefined
): boolean {
  const href = String(ctaHref ?? "").trim();
  if (!href) return false;
  if (/^https?:\/\//i.test(href)) return false;
  if (!href.startsWith("/")) return false;
  return true;
}

export function evaluateDeliveryBannerPublishReadiness(input: {
  creativeAssetPath: string | null | undefined;
  ctaHref: string | null | undefined;
}): {
  ok: boolean;
  creativeReady: boolean;
  destinationReady: boolean;
  reasons: DeliveryBannerCreativeReadinessReason[];
} {
  const reasons: DeliveryBannerCreativeReadinessReason[] = [];
  const creativeReady = isDeliveryBannerCreativeAssetReady(input.creativeAssetPath);
  if (!creativeReady) {
    reasons.push(
      isDeliveryBannerPendingCreativeAsset(input.creativeAssetPath)
        ? String(input.creativeAssetPath ?? "").trim()
          ? "creative_placeholder"
          : "creative_missing"
        : "creative_missing"
    );
  }
  const destinationReady = isDeliveryBannerDestinationReady(input.ctaHref);
  if (!destinationReady) {
    const href = String(input.ctaHref ?? "").trim();
    reasons.push(href ? "destination_invalid" : "destination_missing");
  }
  return {
    ok: creativeReady && destinationReady,
    creativeReady,
    destinationReady,
    reasons,
  };
}

/** Store Promotion never needs Banner IMAGE creative. */
export function storeSponsoredRequiresBannerCreative(): false {
  return false;
}

/** Admin hub: Banner campaign needs Admin production. */
export function isAdminBannerNeedsCreativeProduction(input: {
  productKind: string;
  creativeAssetPath: string | null | undefined;
}): boolean {
  if (input.productKind !== "banner") return false;
  return !isDeliveryBannerCreativeAssetReady(input.creativeAssetPath);
}
