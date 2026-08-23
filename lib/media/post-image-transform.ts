import { snapDisplayPxToProductTier } from "@/lib/image/image-tier";
import {
  resolveCanonicalDetailImageUrl,
  resolveCanonicalFeedImageUrl,
  resolveCanonicalThumbImageUrl,
} from "@/lib/media/canonical-image-resolver";

const POST_IMAGES_BUCKET = "post-images";
const OBJECT_PUBLIC = `/storage/v1/object/public/${POST_IMAGES_BUCKET}/`;

/** @deprecated Phase 2B — tier snap retained for tests; serving uses canonical derivatives. */
export function postImageThumbFetchPx(displayPx: number): number {
  return snapDisplayPxToProductTier(displayPx);
}

/** Stable object/public URL when available. */
export function resolvePostImageObjectPublicUrl(raw: string | null | undefined): string | null {
  const resolved = typeof raw === "string" ? raw.trim() : "";
  if (!resolved || !/^https?:\/\//i.test(resolved)) return resolved || null;
  if (!resolved.includes(POST_IMAGES_BUCKET)) return null;

  let normalized = resolved;
  if (normalized.includes("/storage/v1/render/image/")) {
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

function pickFeedSurface(displayPx: number): "thumb" | "feed" {
  return displayPx <= 96 ? "thumb" : "feed";
}

/**
 * Phase 2B — upload-time derivative URLs (object/public). NO runtime render/image.
 */
export function buildPostImageDetailFetchUrl(
  raw: string | null | undefined
): string | null {
  const resolved = typeof raw === "string" ? raw.trim() : "";
  if (!resolved || !/^https?:\/\//i.test(resolved)) return resolved || null;
  if (!resolved.includes(POST_IMAGES_BUCKET)) return resolved;
  return resolveCanonicalDetailImageUrl(resolved);
}

/** Feed/card thumb — canonical feed or thumb derivative. */
export function buildPostImageThumbnailFetchUrl(
  raw: string | null | undefined,
  displayPx: number
): string | null {
  const resolved = typeof raw === "string" ? raw.trim() : "";
  if (!resolved) return null;
  if (!resolved.includes(POST_IMAGES_BUCKET)) return resolved;
  const surface = pickFeedSurface(displayPx);
  if (surface === "thumb") {
    return resolveCanonicalThumbImageUrl(resolved);
  }
  return resolveCanonicalFeedImageUrl(resolved);
}
