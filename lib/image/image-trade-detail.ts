/**
 * DIBAY Image V2 — trade post detail (`/post/[id]`) image SSOT.
 * Phase 2B: upload-time detail derivative (object/public).
 */
import { resolveCanonicalDetailImageUrl } from "@/lib/media/canonical-image-resolver";

type TradePostDetailImageSource = {
  images?: unknown;
  thumbnail_url?: string | null;
};

export const TRADE_POST_DETAIL_TIER_1280_ENABLED = true;
export const TRADE_POST_DETAIL_TIER_FETCH_PX = 1280 as const;

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

export function imageResolveTradePostDetailDisplayUrl(raw: string): string {
  if (!TRADE_POST_DETAIL_TIER_1280_ENABLED) {
    return raw;
  }
  return resolveCanonicalDetailImageUrl(raw) ?? raw;
}
