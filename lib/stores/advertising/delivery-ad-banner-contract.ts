/**
 * CUT E — Shared DeliveryAdBanner input contract (Owner / Admin / Customer).
 * Geometry authority = inventory seed. No ios/android/tablet ratio props.
 */

import {
  inventorySeedByKey,
  type DeliveryAdInventoryKey,
} from "@/lib/stores/advertising/delivery-ad-inventory";
import { STORES_HOME_CONTENT_COLUMN_CLASS } from "@/lib/stores/stores-home-ui";

export type DeliveryAdBannerRenderContext = "owner_preview" | "admin_preview" | "customer";

export type DeliveryAdBannerInventoryView = {
  key: DeliveryAdInventoryKey;
  aspectRatioWidth: number;
  aspectRatioHeight: number;
  cropPolicy: string;
  objectPosition: string;
  /** CSS-ready safe area insets from inventory contract (optional guide). */
  safeArea?: {
    topPct?: number;
    rightPct?: number;
    bottomPct?: number;
    leftPct?: number;
  } | null;
};

export type DeliveryAdBannerCreativeView = {
  assetUrl: string;
  headline?: string | null;
  subcopy?: string | null;
  alt?: string | null;
};

export type DeliveryAdBannerDestination = {
  href: string;
  ctaLabel?: string | null;
};

export type DeliveryAdBannerProps = {
  inventory: DeliveryAdBannerInventoryView;
  creative: DeliveryAdBannerCreativeView;
  destination: DeliveryAdBannerDestination;
  adLabel: string;
  renderContext: DeliveryAdBannerRenderContext;
  /** Optional campaign id for analytics attrs only. */
  campaignId?: string | null;
  className?: string;
  priority?: boolean;
};

export function inventoryViewFromKey(key: DeliveryAdInventoryKey): DeliveryAdBannerInventoryView {
  const seed = inventorySeedByKey(key);
  return {
    key,
    aspectRatioWidth: seed.aspectRatioWidth,
    aspectRatioHeight: seed.aspectRatioHeight,
    cropPolicy: seed.cropPolicy,
    objectPosition: seed.objectPosition,
    safeArea: { topPct: 8, rightPct: 6, bottomPct: 12, leftPct: 6 },
  };
}

export function deliveryAdBannerAspectStyle(inv: DeliveryAdBannerInventoryView): {
  aspectRatio: string;
} {
  return {
    aspectRatio: `${inv.aspectRatioWidth} / ${inv.aspectRatioHeight}`,
  };
}

export function deliveryAdBannerObjectFit(inv: DeliveryAdBannerInventoryView): "cover" | "contain" {
  return inv.cropPolicy === "contain" ? "contain" : "cover";
}

/** Tablet/desktop: reuse Stores HOME content max width — no new tablet constant. */
export const DELIVERY_AD_BANNER_CONTENT_MAX_CLASS = STORES_HOME_CONTENT_COLUMN_CLASS;

export const DELIVERY_AD_BANNER_RENDERER_CONTRACT = {
  singleComponent: "DeliveryAdBanner",
  forbiddenProps: ["isIos", "isAndroid", "tabletBanner", "iosRatio", "androidRatio"] as const,
  geometryAuthority: "delivery_ad_inventories",
  maxWidthAuthority: "STORES_HOME_CONTENT_COLUMN_CLASS",
} as const;
