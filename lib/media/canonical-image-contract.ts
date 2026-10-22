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

/**
 * store-product-images: hero + list(feed) derivatives added at upload.
 * IMG-01 — 목록·카드 썸네일이 원본(최대 4096px)을 받지 않도록 `feed` 파생본(목록 크기)을 함께 만든다.
 */
export const STORE_PRODUCT_UPLOAD_SURFACES: CanonicalImageSurface[] = ["hero", "feed"];

/**
 * IMG-01 — store bucket `feed`(목록) 파생본 규격. 매장 이미지는 정사각·5:3·4:5·배너 등 여러 비율로
 * 잘려 보이므로 업로드 시점에는 자르지 않고(inside) 긴 변만 줄인다 — 화면이 cover 로 자른다.
 * 960 = 목록 최대 타일(296 CSS px) × DPR 3 의 짧은 변(4:3 기준 720px)을 덮는 값.
 */
export const STORE_PRODUCT_LIST_DERIVATIVE_SPEC = {
  maxEdge: 960,
  fit: "inside" as const,
  quality: 78,
} as const;

/**
 * IMG-01 — `feed` 파생본이 함께 저장된 원본의 파일명 표식 (`{storeId}/{uuid}.l1.webp`).
 * 리졸버는 네트워크 확인 없이 이 표식이 있을 때만 `{uuid}.l1.feed.webp` 를 쓰고,
 * 표식 없는 기존 이미지(파생본 미생성 · backfill 미승인)는 원본을 그대로 쓴다.
 */
export const STORE_PRODUCT_LIST_DERIVATIVE_MARKER = ".l1" as const;

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
