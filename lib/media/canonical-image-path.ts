/**
 * Deterministic Storage path helpers for canonical derivatives (client-safe).
 */
import {
  CANONICAL_DERIVATIVE_SUFFIX,
  POST_IMAGES_BUCKET,
  STORE_PRODUCT_IMAGES_BUCKET,
  STORE_PRODUCT_LIST_DERIVATIVE_MARKER,
  type CanonicalImageBucket,
  type CanonicalImageSurface,
} from "@/lib/media/canonical-image-contract";

const RENDER_SEGMENT = "/storage/v1/render/image/public/";
const OBJECT_SEGMENT = "/storage/v1/object/public/";

export function canonicalBucketFromUrl(url: string): CanonicalImageBucket | null {
  if (url.includes(POST_IMAGES_BUCKET)) return POST_IMAGES_BUCKET;
  if (url.includes(STORE_PRODUCT_IMAGES_BUCKET)) return STORE_PRODUCT_IMAGES_BUCKET;
  return null;
}

export function isSupabaseRenderImageUrl(url: string): boolean {
  return url.includes(RENDER_SEGMENT);
}

export function isCanonicalDerivativePath(storagePath: string): boolean {
  const p = storagePath.toLowerCase();
  return (
    p.endsWith(".thumb.webp") ||
    p.endsWith(".feed.webp") ||
    p.endsWith(".detail.webp") ||
    p.endsWith(".hero.webp")
  );
}

/** Original storage object candidate — never a canonical derivative path. */
export function isEligibleCanonicalOriginalStoragePath(storagePath: string): boolean {
  const p = storagePath.trim();
  if (!p || isCanonicalDerivativePath(p)) return false;
  /** P-4 (I6): GIF 는 업로드 때 변형본을 만들지 않으므로(pipeline `image/gif` → []) 원본 그대로 쓴다 */
  return /\.(jpe?g|png|webp|heic|heif)$/i.test(p);
}

/**
 * IMG-01 — store bucket 원본 중 업로드 시 `feed`(목록) 파생본을 함께 만든 것 (`{uuid}.l1.{ext}`).
 * 네트워크 확인 없이 파일명 표식으로 판정 — 표식 없는 기존 원본은 파생본이 없다고 본다.
 */
export function storeProductOriginalHasListDerivative(storagePath: string): boolean {
  const p = storagePath.trim();
  if (!isEligibleCanonicalOriginalStoragePath(p)) return false;
  const stem = p.replace(/\.[^./]+$/, "");
  return stem.endsWith(STORE_PRODUCT_LIST_DERIVATIVE_MARKER);
}

/** IMG-01 — 목록 파생본을 함께 만드는 store bucket 원본 경로 (`{storeId}/{uuid}.l1.{ext}`). */
export function storeProductListDerivativeOriginalPath(
  storeId: string,
  objectId: string,
  ext: string
): string {
  return `${storeId}/${objectId}${STORE_PRODUCT_LIST_DERIVATIVE_MARKER}.${ext}`;
}

/** Strip render query → object/public base URL. */
export function normalizeToObjectPublicUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return trimmed || null;

  let normalized = trimmed;
  if (normalized.includes(RENDER_SEGMENT)) {
    normalized = normalized.replace(RENDER_SEGMENT, OBJECT_SEGMENT);
  }
  normalized = normalized.replace(
    /\/render\/image\/public\/(post-images|store-product-images)\//gi,
    "/object/public/$1/"
  );

  try {
    const u = new URL(normalized);
    u.search = "";
    return u.toString();
  } catch {
    return normalized.split("?")[0] ?? normalized;
  }
}

/** Extract bucket + storage path from public URL. */
export function parseSupabasePublicObjectUrl(
  url: string
): { bucket: CanonicalImageBucket; path: string } | null {
  const normalized = normalizeToObjectPublicUrl(url);
  if (!normalized) return null;

  for (const bucket of [POST_IMAGES_BUCKET, STORE_PRODUCT_IMAGES_BUCKET] as const) {
    const marker = `${OBJECT_SEGMENT}${bucket}/`;
    const idx = normalized.indexOf(marker);
    if (idx === -1) continue;
    const path = normalized.slice(idx + marker.length);
    if (!path || isCanonicalDerivativePath(path)) return null;
    return { bucket, path };
  }
  return null;
}

/** Original storage path → derivative storage path (sibling suffix). */
export function derivativeStoragePath(
  originalPath: string,
  surface: CanonicalImageSurface
): string {
  const base = originalPath.replace(/\.[^./]+$/, "");
  return `${base}${CANONICAL_DERIVATIVE_SUFFIX[surface]}`;
}

/** Build object/public URL for a derivative from an original public URL. */
export function buildDerivativePublicUrl(
  originalPublicUrl: string,
  surface: CanonicalImageSurface
): string | null {
  const parsed = parseSupabasePublicObjectUrl(originalPublicUrl);
  if (!parsed) return null;
  const derivativePath = derivativeStoragePath(parsed.path, surface);
  const marker = `${OBJECT_SEGMENT}${parsed.bucket}/`;
  const base = normalizeToObjectPublicUrl(originalPublicUrl);
  if (!base) return null;
  const prefix = base.slice(0, base.indexOf(marker) + marker.length);
  return `${prefix}${derivativePath}`;
}

/** Candidate original URLs when a derivative object is not yet backfilled. */
export function buildOriginalFallbackUrlsFromDerivative(derivativeUrl: string): string[] {
  const normalized = normalizeToObjectPublicUrl(derivativeUrl);
  if (!normalized) return [];
  for (const suffix of Object.values(CANONICAL_DERIVATIVE_SUFFIX)) {
    if (!normalized.endsWith(suffix)) continue;
    const base = normalized.slice(0, -suffix.length);
    return [".webp", ".jpg", ".jpeg", ".png", ".gif"].map((ext) => `${base}${ext}`);
  }
  return [];
}

/** Surfaces that apply per bucket. */
export function defaultSurfaceForBucket(
  bucket: CanonicalImageBucket,
  requested: CanonicalImageSurface
): CanonicalImageSurface {
  if (bucket === STORE_PRODUCT_IMAGES_BUCKET) {
    if (requested === "hero") return "hero";
    return "feed";
  }
  return requested;
}
