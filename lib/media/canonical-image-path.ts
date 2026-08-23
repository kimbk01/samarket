/**
 * Deterministic Storage path helpers for canonical derivatives (client-safe).
 */
import {
  CANONICAL_DERIVATIVE_SUFFIX,
  POST_IMAGES_BUCKET,
  STORE_PRODUCT_IMAGES_BUCKET,
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
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(p);
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
