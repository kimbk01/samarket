import {
  buildStoreProductHeroFetchUrl,
  buildStoreProductImageTransformUrl,
  deliveryImageFetchPxFromPreset,
  type DeliveryImageFetchPreset,
} from "@/lib/media/store-product-image-transform";

export type DeliveryMediaSurfacePreset = {
  sizes: string;
  fetchPreset: DeliveryImageFetchPreset | null;
};

/** Detail hero — `(max-width:768px) 100vw` matches mobile full-bleed; cap desktop fetch. */
export const DELIVERY_DETAIL_HERO_SIZES = "(max-width: 768px) 100vw, 960px";

const SURFACE_PRESETS: Record<string, DeliveryMediaSurfacePreset> = {
  "detail-hero": {
    sizes: DELIVERY_DETAIL_HERO_SIZES,
    fetchPreset: "detailHero",
  },
  "detail-hero-transition": {
    sizes: DELIVERY_DETAIL_HERO_SIZES,
    fetchPreset: "heroTransition",
  },
};

const DEFAULT_PRESET: DeliveryMediaSurfacePreset = {
  sizes: "100vw",
  fetchPreset: null,
};

export function resolveDeliveryMediaSurfacePreset(surface: string): DeliveryMediaSurfacePreset {
  return SURFACE_PRESETS[surface.trim()] ?? DEFAULT_PRESET;
}

export function resolveDeliveryMediaFetchSrc(
  src: string | null,
  surface: string
): string | null {
  if (!src) return null;
  const key = surface.trim();
  if (key === "detail-hero") {
    return buildStoreProductHeroFetchUrl(src) ?? src;
  }
  const preset = resolveDeliveryMediaSurfacePreset(surface);
  if (!preset.fetchPreset) return src;
  const px = deliveryImageFetchPxFromPreset(preset.fetchPreset);
  return (
    buildStoreProductImageTransformUrl(src, { width: px, height: Math.round(px * 0.56) }) ?? src
  );
}
