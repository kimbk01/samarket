/**
 * DIBAY Image V2 — trade post detail (`/post/[id]`) image SSOT.
 *
 * Phase 1: `imageResolveTradePostDetailImageUrls` collects raw storage URLs.
 * Phase 2b: `imageResolveTradePostDetailDisplayUrl` applies approved 1280 tier transform.
 */
import { imageBuildPostTransformUrl } from "@/lib/image/image-transform";

type TradePostDetailImageSource = {
  images?: unknown;
  thumbnail_url?: string | null;
};

/**
 * Rollback: set to `false` to restore Phase 1 full-object passthrough in display URL only.
 */
export const TRADE_POST_DETAIL_TIER_1280_ENABLED = true;

/** Approved product/delivery/community tier — detail gallery fetch width (only tier used here). */
export const TRADE_POST_DETAIL_TIER_FETCH_PX = 1280 as const;

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
 * Phase 2b: post-images full object → Supabase transform width=1280 (object-contain in CSS unchanged).
 */
export function imageResolveTradePostDetailDisplayUrl(raw: string): string {
  if (!TRADE_POST_DETAIL_TIER_1280_ENABLED) {
    return raw;
  }
  const tiered = imageBuildPostTransformUrl(raw, {
    width: TRADE_POST_DETAIL_TIER_FETCH_PX,
    height: TRADE_POST_DETAIL_TIER_FETCH_PX,
  });
  return tiered ?? raw;
}
