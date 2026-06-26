/**
 * DIBAY Image V2 — trade post detail related sections (`PostDetailRelatedSections`).
 *
 * Phase 1: full-object passthrough — legacy path used `SamarketThumbnail` without
 * `fetchDisplayPx`, so img `src` stayed the raw storage / external URL.
 * Phase 2b: `imageResolveTradePostDetailRelatedDisplayUrl` applies trade-feed-equivalent
 * width=240 transform (displayPx 120 → fetch 240).
 */
import { loadTradeFeedThumbnailFetchUrl } from "@/lib/image/image-loader";
import { TRADE_FEED_THUMB_DISPLAY_PX } from "@/lib/image/image-size";

type TradePostDetailRelatedThumbSource = {
  thumbnail_url?: string | null;
  images?: unknown;
};

/**
 * Rollback: set to `false` to restore Phase 1 full-object passthrough in display URL only.
 */
export const TRADE_POST_DETAIL_RELATED_TIER_240_ENABLED = true;

/** Reuses trade feed thumb contract — display 120px slot → Supabase fetch width=240. */
export const TRADE_POST_DETAIL_RELATED_DISPLAY_PX = TRADE_FEED_THUMB_DISPLAY_PX;

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
 * Phase 2b: post-images full object → trade-feed-equivalent transform width=240.
 */
export function imageResolveTradePostDetailRelatedDisplayUrl(raw: string): string {
  if (!TRADE_POST_DETAIL_RELATED_TIER_240_ENABLED) {
    return raw;
  }
  return loadTradeFeedThumbnailFetchUrl(raw) ?? raw;
}
