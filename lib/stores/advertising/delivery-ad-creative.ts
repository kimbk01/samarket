/**
 * CUT B — Creative + CTA allowlist authority.
 * No arbitrary external URL as Production CTA.
 */

import type { DeliveryAdProductKey } from "@/lib/stores/advertising/delivery-ad-product-registry";
import type { DeliveryAdInventorySeed } from "@/lib/stores/advertising/delivery-ad-inventory";
import { inventorySeedByKey, type DeliveryAdInventoryKey } from "@/lib/stores/advertising/delivery-ad-inventory";

export const DELIVERY_AD_CREATIVE_TABLE = "delivery_ad_creatives" as const;

export const DELIVERY_AD_CTA_TARGETS = ["store_detail", "store_menu", "store_promotion"] as const;
export type DeliveryAdCtaTarget = (typeof DELIVERY_AD_CTA_TARGETS)[number];

export function isDeliveryAdCtaTarget(value: unknown): value is DeliveryAdCtaTarget {
  return (
    typeof value === "string" &&
    (DELIVERY_AD_CTA_TARGETS as readonly string[]).includes(value)
  );
}

/** Reject free-form http(s) Production CTA strings. */
export function isForbiddenExternalCta(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const s = value.trim().toLowerCase();
  return s.startsWith("http://") || s.startsWith("https://") || s.startsWith("//");
}

export type DeliveryAdCreativeInput = {
  productKind: DeliveryAdProductKey;
  assetPath: string;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  ctaType?: DeliveryAdCtaTarget | null;
  ctaTargetId?: string | null;
  headline?: string | null;
};

export type DeliveryAdCreativeValidationError =
  | "empty_asset_path"
  | "external_cta_forbidden"
  | "invalid_cta_type"
  | "cta_target_required"
  | "incompatible_creative_type"
  | "incompatible_aspect_ratio";

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/** Compare creative pixel ratio to inventory ratio within tolerance. */
export function creativeMatchesInventoryAspect(
  sourceWidth: number,
  sourceHeight: number,
  inventory: Pick<DeliveryAdInventorySeed, "aspectRatioWidth" | "aspectRatioHeight">,
  tolerance = 0.08
): boolean {
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return false;
  const actual = sourceWidth / sourceHeight;
  const expected = inventory.aspectRatioWidth / inventory.aspectRatioHeight;
  return Math.abs(actual - expected) / expected <= tolerance;
}

export function validateDeliveryAdCreativeForInventory(
  input: DeliveryAdCreativeInput,
  inventoryKey: DeliveryAdInventoryKey
): { ok: true } | { ok: false; error: DeliveryAdCreativeValidationError } {
  const inv = inventorySeedByKey(inventoryKey);

  if (input.productKind === "banner") {
    if (!String(input.assetPath ?? "").trim()) {
      return { ok: false, error: "empty_asset_path" };
    }
    if (inv.allowedCreativeType !== "banner_image") {
      return { ok: false, error: "incompatible_creative_type" };
    }
  } else if (inv.allowedCreativeType !== "store_card") {
    return { ok: false, error: "incompatible_creative_type" };
  }

  if (input.ctaType != null) {
    if (!isDeliveryAdCtaTarget(input.ctaType)) {
      return { ok: false, error: "invalid_cta_type" };
    }
    if (!String(input.ctaTargetId ?? "").trim()) {
      return { ok: false, error: "cta_target_required" };
    }
  }

  if (
    input.sourceWidth != null &&
    input.sourceHeight != null &&
    inv.allowedCreativeType === "banner_image" &&
    inv.ratioSource !== "FUTURE"
  ) {
    if (
      !creativeMatchesInventoryAspect(input.sourceWidth, input.sourceHeight, inv)
    ) {
      return { ok: false, error: "incompatible_aspect_ratio" };
    }
  }

  return { ok: true };
}

export function validateCtaPayload(input: {
  ctaType?: unknown;
  externalUrl?: unknown;
}): { ok: true } | { ok: false; error: DeliveryAdCreativeValidationError } {
  if (isForbiddenExternalCta(input.externalUrl)) {
    return { ok: false, error: "external_cta_forbidden" };
  }
  if (input.ctaType != null && !isDeliveryAdCtaTarget(input.ctaType)) {
    return { ok: false, error: "invalid_cta_type" };
  }
  return { ok: true };
}

export function simplifyAspectRatio(width: number, height: number): string {
  const g = gcd(width, height);
  return `${Math.round(width / g)}:${Math.round(height / g)}`;
}
