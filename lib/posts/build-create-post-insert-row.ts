import type { CreatePostPayload } from "@/lib/posts/types";
import { tradeJobColumnsForInsert } from "@/lib/posts/trade-job-db-fields";
import { publicRegionLabelLeaksPrivateDetail } from "@/lib/addresses/community-public-region-label";

/** `createPost` · `POST /api/posts/create` 공통 — posts INSERT 행 조립 */
export function buildCreatePostInsertRow(
  payload: CreatePostPayload,
  userId: string,
  now = new Date().toISOString()
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    user_id: userId,
    trade_category_id: payload.categoryId,
    type: payload.type,
    title: payload.title.trim(),
    content: payload.content.trim(),
    status: "active",
    view_count: 0,
    created_at: now,
    updated_at: now,
  };

  if (payload.type === "community") {
    row.community_topic_id = payload.categoryId;
  }

  if (payload.type === "trade" && "price" in payload) {
    row.price = payload.price != null ? Number(payload.price) : null;
  }

  if (
    payload.type === "trade" &&
    "imageUrls" in payload &&
    Array.isArray(payload.imageUrls) &&
    payload.imageUrls.length > 0
  ) {
    row.images = payload.imageUrls;
    const firstThumb = payload.imageUrls.find(
      (u): u is string => typeof u === "string" && u.trim().length > 0
    );
    if (firstThumb) row.thumbnail_url = firstThumb.trim();
  }

  if (payload.type === "trade" && "region" in payload && payload.region != null && String(payload.region).trim()) {
    const region = payload.region.trim();
    if (!publicRegionLabelLeaksPrivateDetail(region)) row.region = region;
  }
  if (payload.type === "trade" && "city" in payload && payload.city != null && String(payload.city).trim()) {
    const city = payload.city.trim();
    if (!publicRegionLabelLeaksPrivateDetail(city)) row.city = city;
  }
  if (
    payload.type === "trade" &&
    "meta" in payload &&
    payload.meta != null &&
    typeof payload.meta === "object" &&
    Object.keys(payload.meta).length > 0
  ) {
    row.meta = payload.meta;
  }
  if (payload.type === "trade" && "isFreeShare" in payload) {
    row.is_free_share = payload.isFreeShare === true;
  }
  if (payload.type === "trade" && "isPriceOfferEnabled" in payload) {
    row.is_price_offer = payload.isPriceOfferEnabled === true;
  }

  if (payload.type === "trade" && "tradeJob" in payload && payload.tradeJob) {
    Object.assign(row, tradeJobColumnsForInsert(payload.tradeJob));
  }

  if (payload.type === "service") {
    if (payload.region != null && String(payload.region).trim()) {
      const region = payload.region.trim();
      if (!publicRegionLabelLeaksPrivateDetail(region)) row.region = region;
    }
    if (payload.city != null && String(payload.city).trim()) {
      const city = payload.city.trim();
      if (!publicRegionLabelLeaksPrivateDetail(city)) row.city = city;
    }
  }

  return row;
}
