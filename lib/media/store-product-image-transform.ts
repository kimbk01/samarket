import { resolveStoreProductMediaUrl } from "@/lib/media/resolve-store-product-media-url";
import {
  resolveCanonicalHeroImageUrl,
  resolveCanonicalFeedImageUrl,
} from "@/lib/media/canonical-image-resolver";
import {
  snapDeliveryPresetToProductTier,
  snapDisplayPxToProductTier,
} from "@/lib/image/image-tier";

const STORE_PRODUCT_IMAGES_BUCKET = "store-product-images";
const OBJECT_PUBLIC = `/storage/v1/object/public/${STORE_PRODUCT_IMAGES_BUCKET}/`;

/** Legacy display labels — list presets map to primary object; hero → canonical hero derivative. */
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

export const DELIVERY_DETAIL_HERO_FETCH_HEIGHT_PX = 720;
export const DELIVERY_DETAIL_HERO_QUALITY = 80;

export type DeliveryImageFetchPreset = keyof typeof DELIVERY_IMAGE_FETCH_PRESET;

const STORE_PRODUCT_HERO_PRESETS = new Set<DeliveryImageFetchPreset>(["detailHero", "heroTransition"]);

export function deliveryImageFetchPxFromPreset(preset: DeliveryImageFetchPreset): number {
  return snapDeliveryPresetToProductTier(preset);
}

export function deliveryThumbFetchPx(displayPx: number): number {
  return snapDisplayPxToProductTier(displayPx);
}

/** Strip render query params → stable object/public URL for CDN cache. */
export function resolveStoreProductObjectPublicUrl(
  raw: string | null | undefined
): string | null {
  const resolved = resolveStoreProductMediaUrl(raw) ?? (typeof raw === "string" ? raw.trim() : "");
  if (!resolved || !/^https?:\/\//i.test(resolved)) return resolved || null;
  if (!resolved.includes(STORE_PRODUCT_IMAGES_BUCKET)) return null;

  let normalized = resolved;
  if (normalized.includes("/storage/v1/render/image/")) {
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
 * Phase 2B — NO runtime render/image. Hero → upload-time .hero.webp derivative.
 */
export function buildStoreProductHeroDerivativeUrl(
  raw: string | null | undefined
): string | null {
  const resolved = resolveStoreProductMediaUrl(raw) ?? (typeof raw === "string" ? raw.trim() : "");
  if (!resolved || !/^https?:\/\//i.test(resolved)) return resolved || null;
  if (!resolved.includes(STORE_PRODUCT_IMAGES_BUCKET)) return resolved;
  return resolveCanonicalHeroImageUrl(resolved);
}

/** List/card thumb — primary object/public (WebP upload pipeline). */
export function buildStoreProductThumbnailFetchUrl(
  raw: string | null | undefined,
  _displayPx: number
): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;

  const objectUrl = resolveStoreProductObjectPublicUrl(raw);
  if (objectUrl) return objectUrl;

  const resolved = resolveStoreProductMediaUrl(raw) ?? trimmed;
  if (resolved && /^https?:\/\//i.test(resolved) && !resolved.includes(STORE_PRODUCT_IMAGES_BUCKET)) {
    return resolved;
  }

  return resolveCanonicalFeedImageUrl(raw) ?? resolved;
}

/** Preset thumb — list/card → object/public; hero → canonical hero derivative. */
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

    return resolveCanonicalFeedImageUrl(raw) ?? resolved;
  }

  return resolveCanonicalHeroImageUrl(raw);
}

/** Store/product detail LCP hero — upload-time .hero.webp derivative. */
export function buildStoreProductHeroFetchUrl(raw: string | null | undefined): string | null {
  return resolveCanonicalHeroImageUrl(raw);
}

/** Phase 2B: object/public store URLs are pre-sized; hero uses .hero.webp derivative. */
export function isPreOptimizedStoreProductImageUrl(url: string | null | undefined): boolean {
  const u = typeof url === "string" ? url.trim() : "";
  if (!u) return false;
  if (u.includes(".hero.webp")) return true;
  return u.includes(STORE_PRODUCT_IMAGES_BUCKET) && u.includes("/object/public/");
}

export const STORE_PRODUCT_LIST_TIER_PX = 320;
