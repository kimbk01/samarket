/**
 * CUT E — Owner Banner application contracts.
 * ACTIVE inventory only; creative aspect from inventory SSOT (no fake 16:9 swap).
 */

import {
  ACTIVE_DELIVERY_AD_INVENTORY_KEYS,
  inventorySeedByKey,
  isRuntimeActiveInventory,
  type DeliveryAdInventoryKey,
} from "@/lib/stores/advertising/delivery-ad-inventory";
import {
  creativeMatchesInventoryAspect,
  isDeliveryAdCtaTarget,
  isForbiddenExternalCta,
  type DeliveryAdCtaTarget,
} from "@/lib/stores/advertising/delivery-ad-creative";
import {
  DELIVERY_AD_OWNER_PRICING_PRODUCT,
  validateOwnerStoreSponsoredSchedule,
} from "@/lib/stores/advertising/owner-store-sponsored-contract";
import {
  BANNER_AD_DB_SURFACE,
  type BannerAdDbSurface,
} from "@/lib/stores/advertising/delivery-ad-placement";

/** Owner-selectable banner inventories (ACTIVE only). */
export const OWNER_BANNER_INVENTORY_KEYS = [
  "STORES_HOME_HERO",
  "STORES_SEARCH_TOP",
] as const satisfies ReadonlyArray<DeliveryAdInventoryKey>;

export type OwnerBannerInventoryKey = (typeof OWNER_BANNER_INVENTORY_KEYS)[number];

export const OWNER_BANNER_CTA_LABEL_KEYS = [
  "owner_ads_banner_cta_store",
  "owner_ads_banner_cta_menu",
  "owner_ads_banner_cta_promo",
] as const;

export type OwnerBannerCtaLabelKey = (typeof OWNER_BANNER_CTA_LABEL_KEYS)[number];

export const OWNER_BANNER_CTA_TARGET_TO_LABEL_KEY: Record<
  DeliveryAdCtaTarget,
  OwnerBannerCtaLabelKey
> = {
  store_detail: "owner_ads_banner_cta_store",
  store_menu: "owner_ads_banner_cta_menu",
  store_promotion: "owner_ads_banner_cta_promo",
};

export const OWNER_BANNER_PRICING = DELIVERY_AD_OWNER_PRICING_PRODUCT;

export const OWNER_BANNER_CROP_POLICY = {
  mode: "crop_capable" as const,
  stretchForbidden: true,
  exactUploadOptional: false,
  note: "Owner crops to inventory aspect before submit; server re-validates ratio",
} as const;

export function isOwnerBannerInventoryKey(value: unknown): value is OwnerBannerInventoryKey {
  return (
    typeof value === "string" &&
    (OWNER_BANNER_INVENTORY_KEYS as readonly string[]).includes(value)
  );
}

export function validateOwnerBannerInventory(
  raw: unknown
):
  | { ok: true; key: OwnerBannerInventoryKey }
  | { ok: false; error: "no_inventory" | "invalid_inventory" | "future_inventory" } {
  if (raw == null || raw === "") return { ok: false, error: "no_inventory" };
  if (!isOwnerBannerInventoryKey(raw)) {
    if (typeof raw === "string" && (ACTIVE_DELIVERY_AD_INVENTORY_KEYS as readonly string[]).includes(raw) === false) {
      return { ok: false, error: "future_inventory" };
    }
    return { ok: false, error: "invalid_inventory" };
  }
  if (!isRuntimeActiveInventory(raw)) return { ok: false, error: "future_inventory" };
  return { ok: true, key: raw };
}

export function validateOwnerBannerCreativeAspect(input: {
  inventoryKey: DeliveryAdInventoryKey;
  sourceWidth: number;
  sourceHeight: number;
}): { ok: true } | { ok: false; error: "aspect_mismatch" | "invalid_dimensions" } {
  if (!(input.sourceWidth > 0) || !(input.sourceHeight > 0)) {
    return { ok: false, error: "invalid_dimensions" };
  }
  const inv = inventorySeedByKey(input.inventoryKey);
  if (!creativeMatchesInventoryAspect(input.sourceWidth, input.sourceHeight, inv)) {
    return { ok: false, error: "aspect_mismatch" };
  }
  return { ok: true };
}

export function validateOwnerBannerCta(input: {
  ctaType: unknown;
  ctaTargetId: unknown;
  externalUrl?: unknown;
}):
  | { ok: true; ctaType: DeliveryAdCtaTarget; ctaTargetId: string }
  | {
      ok: false;
      error: "external_cta_forbidden" | "invalid_cta_type" | "cta_target_required";
    } {
  if (isForbiddenExternalCta(input.externalUrl)) {
    return { ok: false, error: "external_cta_forbidden" };
  }
  if (!isDeliveryAdCtaTarget(input.ctaType)) {
    return { ok: false, error: "invalid_cta_type" };
  }
  const targetId = String(input.ctaTargetId ?? "").trim();
  if (!targetId) return { ok: false, error: "cta_target_required" };
  return { ok: true, ctaType: input.ctaType, ctaTargetId: targetId };
}

export const validateOwnerBannerSchedule = validateOwnerStoreSponsoredSchedule;

/** Map CTA allowlist → canonical internal path (never external). */
export function resolveOwnerBannerCtaHref(input: {
  ctaType: DeliveryAdCtaTarget;
  storeSlug: string;
}): string {
  const slug = encodeURIComponent(input.storeSlug.trim());
  if (!slug) return "";
  switch (input.ctaType) {
    case "store_menu":
      return `/stores/${slug}#menu`;
    case "store_promotion":
      return `/stores/${slug}?tab=promo`;
    case "store_detail":
    default:
      return `/stores/${slug}`;
  }
}

export function ownerBannerInventoryToLegacySurface(
  key: OwnerBannerInventoryKey
): BannerAdDbSurface {
  if (key === "STORES_SEARCH_TOP") return "stores_search";
  return BANNER_AD_DB_SURFACE;
}

/** Owner/Admin UX label key — never expose technical inventory keys. */
export function ownerBannerInventoryLabelKey(
  key: OwnerBannerInventoryKey
): "owner_ads_inventory_home_hero" | "owner_ads_inventory_search_top" {
  if (key === "STORES_SEARCH_TOP") return "owner_ads_inventory_search_top";
  return "owner_ads_inventory_home_hero";
}

export function ownerBannerAspectGuideCopy(inventoryKey: DeliveryAdInventoryKey): {
  ratioLabel: string;
  width: number;
  height: number;
} {
  const inv = inventorySeedByKey(inventoryKey);
  return {
    ratioLabel: `${inv.aspectRatioWidth}:${inv.aspectRatioHeight}`,
    width: inv.aspectRatioWidth,
    height: inv.aspectRatioHeight,
  };
}
