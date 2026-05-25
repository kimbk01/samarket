import { resolveStoreProductMediaUrl } from "@/lib/media/resolve-store-product-media-url";

const STORE_PRODUCT_IMAGES_BUCKET = "store-product-images";
const OBJECT_PUBLIC = `/storage/v1/object/public/${STORE_PRODUCT_IMAGES_BUCKET}/`;
const RENDER_PUBLIC = `/storage/v1/render/image/public/${STORE_PRODUCT_IMAGES_BUCKET}/`;

/** CSS display px × 2 (retina), clamped for list/thumb surfaces. */
export function deliveryThumbFetchPx(displayPx: number): number {
  const d = Math.max(1, Math.round(displayPx));
  return Math.min(384, Math.max(96, d * 2));
}

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
  /** Transition overlay — smaller than hero, not LCP. */
  heroTransition: 960,
  /** Detail LCP hero — mobile 2× retina cap (~430×288 CSS box). */
  detailHero: 960,
} as const;

/** `clamp(13rem,44vh,18rem)` @ ~430px viewport → ~288px tall; cover @ 960w. */
export const DELIVERY_DETAIL_HERO_FETCH_HEIGHT_PX = 720;
export const DELIVERY_DETAIL_HERO_QUALITY = 80;

export type DeliveryImageFetchPreset = keyof typeof DELIVERY_IMAGE_FETCH_PRESET;

export function deliveryImageFetchPxFromPreset(preset: DeliveryImageFetchPreset): number {
  return DELIVERY_IMAGE_FETCH_PRESET[preset];
}

function isTransformableStoreProductUrl(url: string): boolean {
  if (!url.includes(STORE_PRODUCT_IMAGES_BUCKET)) return false;
  if (url.includes("/storage/v1/render/image/")) return false;
  return url.includes(OBJECT_PUBLIC) || url.includes(`/object/public/${STORE_PRODUCT_IMAGES_BUCKET}/`);
}

/**
 * Supabase Storage Image Transform — store-product-images only.
 * Non-matching URLs (external, SVG fallback) pass through unchanged.
 */
export function buildStoreProductImageTransformUrl(
  raw: string | null | undefined,
  opts: { width: number; height?: number; quality?: number }
): string | null {
  const resolved = resolveStoreProductMediaUrl(raw) ?? (typeof raw === "string" ? raw.trim() : "");
  if (!resolved || !/^https?:\/\//i.test(resolved)) return resolved || null;
  if (!isTransformableStoreProductUrl(resolved)) return resolved;

  const w = Math.max(32, Math.round(opts.width));
  const h = Math.max(32, Math.round(opts.height ?? w));
  const quality = Math.min(100, Math.max(40, Math.round(opts.quality ?? 78)));

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

export function buildStoreProductThumbnailFetchUrl(
  raw: string | null | undefined,
  displayPx: number
): string | null {
  const fetchPx = deliveryThumbFetchPx(displayPx);
  return buildStoreProductImageTransformUrl(raw, { width: fetchPx, height: fetchPx });
}

export function buildStoreProductThumbnailFetchUrlFromPreset(
  raw: string | null | undefined,
  preset: DeliveryImageFetchPreset
): string | null {
  const fetchPx = deliveryImageFetchPxFromPreset(preset);
  return buildStoreProductImageTransformUrl(raw, { width: fetchPx, height: fetchPx });
}

/** Store/product detail LCP hero — transform when bucket matches, else full URL fallback. */
export function buildStoreProductHeroFetchUrl(raw: string | null | undefined): string | null {
  const w = deliveryImageFetchPxFromPreset("detailHero");
  return buildStoreProductImageTransformUrl(raw, {
    width: w,
    height: DELIVERY_DETAIL_HERO_FETCH_HEIGHT_PX,
    quality: DELIVERY_DETAIL_HERO_QUALITY,
  });
}

export function isPreOptimizedStoreProductImageUrl(url: string | null | undefined): boolean {
  const u = typeof url === "string" ? url.trim() : "";
  return u.includes("/storage/v1/render/image/");
}
