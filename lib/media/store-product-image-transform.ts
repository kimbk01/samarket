import { resolveStoreProductMediaUrl } from "@/lib/media/resolve-store-product-media-url";
import {
  IMAGE_PRODUCT_TIERS,
  normalizeTierTransformDimensions,
  snapDeliveryPresetToProductTier,
  snapDisplayPxToProductTier,
} from "@/lib/image/image-tier";

const STORE_PRODUCT_IMAGES_BUCKET = "store-product-images";
const OBJECT_PUBLIC = `/storage/v1/object/public/${STORE_PRODUCT_IMAGES_BUCKET}/`;
const RENDER_PUBLIC = `/storage/v1/render/image/public/${STORE_PRODUCT_IMAGES_BUCKET}/`;

/** Legacy display labels — Phase 2A resolves via snapDeliveryPresetToProductTier. */
export const DELIVERY_IMAGE_FETCH_PRESET = {
  upsell: 112,
  cart: 144,
  cartLine: 144,
  menu: 184,
  menuPublic: 176,
  list: 192,
  recommended: 224,
  rowFeatured: 232,
  hubFood: 240,
  stickyProfile: 80,
  galleryStrip: 96,
  discoveryProfile: 296,
  heroTransition: 960,
  detailHero: 960,
} as const;

/** `clamp(13rem,44vh,18rem)` @ ~430px viewport → ~288px tall; cover @ 1280w (Phase 2A tier). */
export const DELIVERY_DETAIL_HERO_FETCH_HEIGHT_PX = 720;
export const DELIVERY_DETAIL_HERO_QUALITY = 80;

export type DeliveryImageFetchPreset = keyof typeof DELIVERY_IMAGE_FETCH_PRESET;

const STORE_PRODUCT_HERO_PRESETS = new Set<DeliveryImageFetchPreset>(["detailHero", "heroTransition"]);

/** Phase 2A — all list/card presets → 320 tier; hero presets → 1280. */
export function deliveryImageFetchPxFromPreset(preset: DeliveryImageFetchPreset): number {
  return snapDeliveryPresetToProductTier(preset);
}

/** Phase 2A — tier snap (list thumbs prefer object/public). */
export function deliveryThumbFetchPx(displayPx: number): number {
  return snapDisplayPxToProductTier(displayPx);
}

function isTransformableStoreProductUrl(url: string): boolean {
  if (!url.includes(STORE_PRODUCT_IMAGES_BUCKET)) return false;
  if (url.includes("/storage/v1/render/image/")) return false;
  return url.includes(OBJECT_PUBLIC) || url.includes(`/object/public/${STORE_PRODUCT_IMAGES_BUCKET}/`);
}

/** Strip render query params → stable object/public URL for CDN cache. */
export function resolveStoreProductObjectPublicUrl(
  raw: string | null | undefined
): string | null {
  const resolved = resolveStoreProductMediaUrl(raw) ?? (typeof raw === "string" ? raw.trim() : "");
  if (!resolved || !/^https?:\/\//i.test(resolved)) return resolved || null;
  if (!resolved.includes(STORE_PRODUCT_IMAGES_BUCKET)) return null;

  let normalized = resolved;
  if (normalized.includes(RENDER_PUBLIC)) {
    normalized = normalized.replace(RENDER_PUBLIC, OBJECT_PUBLIC);
  } else if (normalized.includes("/storage/v1/render/image/")) {
    normalized = normalized.replace(
      new RegExp(`/render/image/public/${STORE_PRODUCT_IMAGES_BUCKET}/`, "i"),
      `/object/public/${STORE_PRODUCT_IMAGES_BUCKET}/`
    );
  }

  if (
    !normalized.includes(OBJECT_PUBLIC) &&
    !normalized.includes(`/object/public/${STORE_PRODUCT_IMAGES_BUCKET}/`)
  ) {
    return null;
  }

  try {
    const u = new URL(normalized);
    u.search = "";
    return u.toString();
  } catch {
    return normalized.split("?")[0] ?? normalized;
  }
}

function shouldStoreProductListThumbUseObjectPublic(preset?: DeliveryImageFetchPreset): boolean {
  if (preset == null) return true;
  return !STORE_PRODUCT_HERO_PRESETS.has(preset);
}

/**
 * Supabase Storage Image Transform — store-product-images only.
 * Phase 2A: dimensions snapped to 320 / 640 / 1280 tiers.
 */
export function buildStoreProductImageTransformUrl(
  raw: string | null | undefined,
  opts: { width: number; height?: number; quality?: number }
): string | null {
  const resolved = resolveStoreProductMediaUrl(raw) ?? (typeof raw === "string" ? raw.trim() : "");
  if (!resolved || !/^https?:\/\//i.test(resolved)) return resolved || null;
  if (!isTransformableStoreProductUrl(resolved)) return resolved;

  const { width: w, height: h, quality } = normalizeTierTransformDimensions(opts);

  const renderBase = resolved.includes(OBJECT_PUBLIC)
    ? resolved.replace(OBJECT_PUBLIC, RENDER_PUBLIC)
    : resolved.replace(
        new RegExp(`/object/public/${STORE_PRODUCT_IMAGES_BUCKET}/`, "i"),
        `/render/image/public/${STORE_PRODUCT_IMAGES_BUCKET}/`
      );

  const url = new URL(renderBase);
  url.searchParams.set("width", String(w));
  url.searchParams.set("height", String(h));
  url.searchParams.set("resize", "cover");
  url.searchParams.set("quality", String(quality));
  return url.toString();
}

/**
 * List/card thumb — Phase 2A: stable object/public (WebP upload pipeline).
 * Transform fallback only when object URL cannot be resolved.
 */
export function buildStoreProductThumbnailFetchUrl(
  raw: string | null | undefined,
  displayPx: number
): string | null {
  const objectUrl = resolveStoreProductObjectPublicUrl(raw);
  if (objectUrl) return objectUrl;

  const resolved = resolveStoreProductMediaUrl(raw) ?? (typeof raw === "string" ? raw.trim() : "");
  if (resolved && /^https?:\/\//i.test(resolved) && !resolved.includes(STORE_PRODUCT_IMAGES_BUCKET)) {
    return resolved;
  }

  const tier = snapDisplayPxToProductTier(displayPx);
  return buildStoreProductImageTransformUrl(raw, { width: tier, height: tier });
}

/** Preset thumb — list/card → object/public; hero → 1280 tier transform. */
export function buildStoreProductThumbnailFetchUrlFromPreset(
  raw: string | null | undefined,
  preset: DeliveryImageFetchPreset
): string | null {
  if (shouldStoreProductListThumbUseObjectPublic(preset)) {
    const objectUrl = resolveStoreProductObjectPublicUrl(raw);
    if (objectUrl) return objectUrl;

    const resolved = resolveStoreProductMediaUrl(raw) ?? (typeof raw === "string" ? raw.trim() : "");
    if (resolved && /^https?:\/\//i.test(resolved) && !resolved.includes(STORE_PRODUCT_IMAGES_BUCKET)) {
      return resolved;
    }

    const tier = snapDeliveryPresetToProductTier(preset);
    return buildStoreProductImageTransformUrl(raw, { width: tier, height: tier });
  }

  const tier = snapDeliveryPresetToProductTier(preset);
  if (preset === "detailHero") {
    return buildStoreProductImageTransformUrl(raw, {
      width: tier,
      height: DELIVERY_DETAIL_HERO_FETCH_HEIGHT_PX,
      quality: DELIVERY_DETAIL_HERO_QUALITY,
    });
  }
  return buildStoreProductImageTransformUrl(raw, { width: tier, height: tier });
}

/** Store/product detail LCP hero — 1280 tier transform (Phase 2A). */
export function buildStoreProductHeroFetchUrl(raw: string | null | undefined): string | null {
  const tier = snapDeliveryPresetToProductTier("detailHero");
  return buildStoreProductImageTransformUrl(raw, {
    width: tier,
    height: DELIVERY_DETAIL_HERO_FETCH_HEIGHT_PX,
    quality: DELIVERY_DETAIL_HERO_QUALITY,
  });
}

/** Phase 2A: object/public store URLs are pre-sized (WebP upload); render URLs still optimized. */
export function isPreOptimizedStoreProductImageUrl(url: string | null | undefined): boolean {
  const u = typeof url === "string" ? url.trim() : "";
  if (!u) return false;
  if (u.includes("/storage/v1/render/image/")) return true;
  return u.includes(STORE_PRODUCT_IMAGES_BUCKET) && u.includes("/object/public/");
}

/** @internal re-export tier constant for tests */
export const STORE_PRODUCT_LIST_TIER_PX = IMAGE_PRODUCT_TIERS[0];
