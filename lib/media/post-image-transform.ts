import {
  normalizeTierTransformDimensions,
  snapDisplayPxToProductTier,
} from "@/lib/image/image-tier";

const POST_IMAGES_BUCKET = "post-images";
const OBJECT_PUBLIC = `/storage/v1/object/public/${POST_IMAGES_BUCKET}/`;
const RENDER_PUBLIC = `/storage/v1/render/image/public/${POST_IMAGES_BUCKET}/`;

function isTransformablePostImageUrl(url: string): boolean {
  if (!url.includes(POST_IMAGES_BUCKET)) return false;
  if (url.includes("/storage/v1/render/image/")) return false;
  return url.includes(OBJECT_PUBLIC) || url.includes(`/object/public/${POST_IMAGES_BUCKET}/`);
}

/** Phase 2A — tier snap (320 / 640 / 1280). */
export function postImageThumbFetchPx(displayPx: number): number {
  return snapDisplayPxToProductTier(displayPx);
}

/** Stable object/public URL when available (Phase 2B will add dedicated thumb paths). */
export function resolvePostImageObjectPublicUrl(raw: string | null | undefined): string | null {
  const resolved = typeof raw === "string" ? raw.trim() : "";
  if (!resolved || !/^https?:\/\//i.test(resolved)) return resolved || null;
  if (!resolved.includes(POST_IMAGES_BUCKET)) return null;

  let normalized = resolved;
  if (normalized.includes(RENDER_PUBLIC)) {
    normalized = normalized.replace(RENDER_PUBLIC, OBJECT_PUBLIC);
  } else if (normalized.includes("/storage/v1/render/image/")) {
    normalized = normalized.replace(
      new RegExp(`/render/image/public/${POST_IMAGES_BUCKET}/`, "i"),
      `/object/public/${POST_IMAGES_BUCKET}/`
    );
  }

  if (
    !normalized.includes(OBJECT_PUBLIC) &&
    !normalized.includes(`/object/public/${POST_IMAGES_BUCKET}/`)
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

/**
 * Supabase Storage Image Transform — post-images (Philife·Trade feed).
 * Phase 2A: tier-snapped dimensions only (320 / 640 / 1280).
 * External URLs pass through unchanged.
 */
export function buildPostImageTransformUrl(
  raw: string | null | undefined,
  opts: { width: number; height?: number; quality?: number }
): string | null {
  const resolved = typeof raw === "string" ? raw.trim() : "";
  if (!resolved || !/^https?:\/\//i.test(resolved)) return resolved || null;
  if (!isTransformablePostImageUrl(resolved)) return resolved;

  const { width: w, height: h, quality } = normalizeTierTransformDimensions(opts);

  const renderBase = resolved.includes(OBJECT_PUBLIC)
    ? resolved.replace(OBJECT_PUBLIC, RENDER_PUBLIC)
    : resolved.replace(
        new RegExp(`/object/public/${POST_IMAGES_BUCKET}/`, "i"),
        `/render/image/public/${POST_IMAGES_BUCKET}/`
      );

  const url = new URL(renderBase);
  url.searchParams.set("width", String(w));
  url.searchParams.set("height", String(h));
  url.searchParams.set("resize", "cover");
  url.searchParams.set("quality", String(quality));
  return url.toString();
}

/**
 * Feed/card thumb — Phase 2A: tier transform (upload thumbs deferred to Phase 2B).
 * object/public is source; output is tier-snapped render URL.
 */
export function buildPostImageThumbnailFetchUrl(
  raw: string | null | undefined,
  displayPx: number
): string | null {
  const tier = snapDisplayPxToProductTier(displayPx);
  return buildPostImageTransformUrl(raw, { width: tier, height: tier });
}
