/**
 * DIBAY Image V2 — trade post detail related sections (`PostDetailRelatedSections`).
 *
 * Phase 1: full-object passthrough — legacy path used `SamarketThumbnail` without
 * `fetchDisplayPx`, so img `src` stays the raw storage / external URL (byte-identical).
 * Phase 2 (future): tier transform applies in `imageResolveTradePostDetailRelatedDisplayUrl` only.
 */
type TradePostDetailRelatedThumbSource = {
  thumbnail_url?: string | null;
  images?: unknown;
};

/**
 * Raw thumb URL from related post payload.
 * @see PostDetailRelatedSections legacy `itemThumb`
 */
export function imageResolveTradePostDetailRelatedThumbRaw(
  post: TradePostDetailRelatedThumbSource
): string | null {
  if (typeof post.thumbnail_url === "string" && post.thumbnail_url.trim()) {
    return post.thumbnail_url.trim();
  }
  const firstImage = Array.isArray(post.images)
    ? post.images.find((u): u is string => typeof u === "string" && u.trim().length > 0)
    : null;
  return firstImage ?? null;
}

/**
 * Per-card display URL for related `SamarketThumbnail` (no `fetchDisplayPx`).
 * Phase 1: passthrough — byte-identical to legacy full-object / external URL.
 */
export function imageResolveTradePostDetailRelatedDisplayUrl(raw: string): string {
  return raw;
}
