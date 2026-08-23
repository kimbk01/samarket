/**
 * DIBAY Canonical Image Platform — derivative contract (upload-time SSOT).
 *
 * Runtime Supabase `/storage/v1/render/image/` is forbidden in production serving.
 * Components request semantic surfaces only; resolver maps to stored object/public derivatives.
 */

export const POST_IMAGES_BUCKET = "post-images" as const;
export const STORE_PRODUCT_IMAGES_BUCKET = "store-product-images" as const;

/** Semantic surfaces — components must use these, not width/height. */
export type CanonicalImageSurface = "thumb" | "feed" | "detail" | "hero";

/**
 * Minimal derivative set from measured UI demand (Phase 2B):
 * - thumb: 52–80px rails → 320 cover square
 * - feed: market 120px / community 88px list tiles → 640 cover square
 * - detail: trade gallery max ~1280 contain
 * - hero: store/product/banner LCP → 1280×720 cover
 */
export const CANONICAL_DERIVATIVE_SUFFIX: Record<CanonicalImageSurface, string> = {
  thumb: ".thumb.webp",
  feed: ".feed.webp",
  detail: ".detail.webp",
  hero: ".hero.webp",
};

export const CANONICAL_DERIVATIVE_SPEC = {
  thumb: { maxEdge: 320, fit: "cover" as const, quality: 78, square: true },
  feed: { maxEdge: 640, fit: "cover" as const, quality: 78, square: true },
  detail: { maxEdge: 1280, fit: "inside" as const, quality: 80, square: false },
  hero: { width: 1280, height: 720, fit: "cover" as const, quality: 80, square: false },
} as const;

/** post-images surfaces generated at upload. */
export const POST_IMAGE_UPLOAD_SURFACES: CanonicalImageSurface[] = ["thumb", "feed", "detail"];

/** store-product-images: primary webp is list/menu SSOT; hero added at upload. */
export const STORE_PRODUCT_UPLOAD_SURFACES: CanonicalImageSurface[] = ["hero"];

/** Avatar — thumb only (display ≤112px). */
export const AVATAR_UPLOAD_SURFACES: CanonicalImageSurface[] = ["thumb"];

export type CanonicalImageBucket =
  | typeof POST_IMAGES_BUCKET
  | typeof STORE_PRODUCT_IMAGES_BUCKET;

/**
 * HEIC POLICY (LOCKED):
 * - Mobile `image/*` pickers may send HEIC/HEIF (especially iOS).
 * - Canonical post-images ingest accepts HEIC only through server APIs that call
 *   `uploadPostImageWithDerivatives` (Market, Community, Philife album, reviews).
 * - Server MUST decode HEIC → JPEG → WebP before Storage; never persist raw `.heic`.
 * - Owner product / avatar / messenger image APIs explicitly reject HEIC at validation.
 */
export const CANONICAL_HEIC_MIME_TYPES = ["image/heic", "image/heif"] as const;

export const CANONICAL_POST_IMAGE_ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  ...CANONICAL_HEIC_MIME_TYPES,
] as const;
