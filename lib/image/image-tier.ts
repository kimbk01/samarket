/**
 * DIBAY Image V2 — tier snap SSOT (no media-module imports — cycle-safe).
 */

/** Product / feed / delivery snap tiers — approved 2026-06-26. */
export const IMAGE_PRODUCT_TIERS = [320, 640, 1280] as const;
export type ImageProductTier = (typeof IMAGE_PRODUCT_TIERS)[number];

/** Avatar tiers — Phase 2A does not change avatar URLs. */
export const IMAGE_AVATAR_TIERS = [48, 96, 192] as const;
export type ImageAvatarTier = (typeof IMAGE_AVATAR_TIERS)[number];

/** Messenger tiers — Phase 2B+. */
export const IMAGE_MESSENGER_TIERS = [640, 1280] as const;

const PRODUCT_TIER_MAX = IMAGE_PRODUCT_TIERS[IMAGE_PRODUCT_TIERS.length - 1];

/** Fixed quality for tier transforms — limits URL variant explosion. */
export const IMAGE_TIER_TRANSFORM_QUALITY = 78;

/**
 * Snap fetch/request px to the nearest upper product tier (320 → 640 → 1280).
 * Values above 1280 clamp to 1280.
 */
export function snapToProductTier(fetchPx: number): ImageProductTier {
  const px = Math.max(1, Math.round(fetchPx));
  if (px <= IMAGE_PRODUCT_TIERS[0]) return IMAGE_PRODUCT_TIERS[0];
  if (px <= IMAGE_PRODUCT_TIERS[1]) return IMAGE_PRODUCT_TIERS[1];
  return PRODUCT_TIER_MAX;
}

/** CSS display px × 2 (retina) → product tier. */
export function snapDisplayPxToProductTier(displayPx: number): ImageProductTier {
  const d = Math.max(1, Math.round(displayPx));
  return snapToProductTier(d * 2);
}

export type ImageTransformDimensionOpts = {
  width: number;
  height?: number;
  quality?: number;
};

/**
 * Normalize transform dimensions to tier buckets.
 * Hero rectangles (width ≥ 640, height ≠ width) keep height for cover aspect.
 */
export function normalizeTierTransformDimensions(opts: ImageTransformDimensionOpts): {
  width: number;
  height: number;
  quality: number;
} {
  const quality = Math.min(
    100,
    Math.max(40, Math.round(opts.quality ?? IMAGE_TIER_TRANSFORM_QUALITY))
  );
  const rawW = Math.max(32, Math.round(opts.width));
  const rawH = opts.height != null ? Math.max(32, Math.round(opts.height)) : rawW;

  if (rawH !== rawW && rawW >= IMAGE_PRODUCT_TIERS[1]) {
    return {
      width: snapToProductTier(rawW),
      height: rawH,
      quality,
    };
  }

  const tier = snapToProductTier(Math.max(rawW, rawH));
  return { width: tier, height: tier, quality };
}

/** Delivery hero preset names — shared with image-policy. */
export type DeliveryHeroPreset = "detailHero" | "heroTransition";

/** Delivery list/card preset → 320; hero preset → 1280. */
export function snapDeliveryPresetToProductTier(
  preset: DeliveryHeroPreset | string
): ImageProductTier {
  if (preset === "detailHero" || preset === "heroTransition") return PRODUCT_TIER_MAX;
  return IMAGE_PRODUCT_TIERS[0];
}
