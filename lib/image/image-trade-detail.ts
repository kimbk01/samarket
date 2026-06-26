/**
 * DIBAY Image V2 — trade post detail (`/post/[id]`) image SSOT.
 *
 * Phase 1: byte-identical passthrough — hero gallery uses full object URLs as today.
 * Phase 2 (separate approval): may apply approved tier transform (e.g. 1280) here only.
 */

type TradePostDetailImageSource = {
  images?: unknown;
  thumbnail_url?: string | null;
};

/**
 * Collect trade detail gallery URLs from post payload.
 * @see PostDetailView legacy `resolveTradePostDetailImageUrls`
 */
export function imageResolveTradePostDetailImageUrls(
  post: TradePostDetailImageSource
): string[] {
  const imgArr = Array.isArray(post.images)
    ? post.images.filter((s): s is string => typeof s === "string")
    : [];
  if (imgArr.length > 0) return imgArr;
  const t = post.thumbnail_url;
  return typeof t === "string" && t.trim() ? [t.trim()] : [];
}

/**
 * Per-slide display URL for `ProductImageGallery`.
 * Phase 1 passthrough — output must match input string exactly.
 */
export function imageResolveTradePostDetailDisplayUrl(raw: string): string {
  return raw;
}
