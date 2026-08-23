/**
 * Canonical image URL resolver — semantic surface → object/public derivative.
 * NO runtime Supabase Image Transformation.
 */
import {
  POST_IMAGES_BUCKET,
  STORE_PRODUCT_IMAGES_BUCKET,
  type CanonicalImageSurface,
} from "@/lib/media/canonical-image-contract";
import {
  buildDerivativePublicUrl,
  canonicalBucketFromUrl,
  normalizeToObjectPublicUrl,
  parseSupabasePublicObjectUrl,
} from "@/lib/media/canonical-image-path";
import { resolvePostImageObjectPublicUrl } from "@/lib/media/post-image-transform";
import { resolveStoreProductObjectPublicUrl } from "@/lib/media/store-product-image-transform";

export type CanonicalImageResolveInput = {
  raw: string | null | undefined;
  surface: CanonicalImageSurface;
};

function resolveObjectPublicBase(raw: string): string | null {
  const bucket = canonicalBucketFromUrl(raw);
  if (bucket === POST_IMAGES_BUCKET) {
    return resolvePostImageObjectPublicUrl(raw) ?? normalizeToObjectPublicUrl(raw);
  }
  if (bucket === STORE_PRODUCT_IMAGES_BUCKET) {
    return resolveStoreProductObjectPublicUrl(raw) ?? normalizeToObjectPublicUrl(raw);
  }
  return normalizeToObjectPublicUrl(raw);
}

/**
 * Map semantic surface → stored derivative URL (object/public).
 * Falls back to original object/public when derivative path cannot be derived.
 * External URLs pass through unchanged.
 */
export function resolveCanonicalImageUrl(input: CanonicalImageResolveInput): string | null {
  const resolved = typeof input.raw === "string" ? input.raw.trim() : "";
  if (!resolved) return null;
  if (!/^https?:\/\//i.test(resolved)) return resolved;

  const bucket = canonicalBucketFromUrl(resolved);
  if (!bucket) return resolved;

  const base = resolveObjectPublicBase(resolved);
  if (!base) return resolved;

  if (bucket === STORE_PRODUCT_IMAGES_BUCKET && input.surface !== "hero") {
    return base;
  }

  const derivative = buildDerivativePublicUrl(base, input.surface);
  return derivative ?? base;
}

/** Feed list thumb — post: feed derivative; store: primary object. */
export function resolveCanonicalFeedImageUrl(raw: string | null | undefined): string | null {
  return resolveCanonicalImageUrl({ raw, surface: "feed" });
}

/** Small rail / avatar thumb. */
export function resolveCanonicalThumbImageUrl(raw: string | null | undefined): string | null {
  return resolveCanonicalImageUrl({ raw, surface: "thumb" });
}

/** Detail gallery / large preview. */
export function resolveCanonicalDetailImageUrl(raw: string | null | undefined): string | null {
  return resolveCanonicalImageUrl({ raw, surface: "detail" });
}

/** Store/product/banner hero LCP. */
export function resolveCanonicalHeroImageUrl(raw: string | null | undefined): string | null {
  return resolveCanonicalImageUrl({ raw, surface: "hero" });
}

export function isDibayManagedImageUrl(url: string | null | undefined): boolean {
  const u = typeof url === "string" ? url.trim() : "";
  return Boolean(u && parseSupabasePublicObjectUrl(u));
}
