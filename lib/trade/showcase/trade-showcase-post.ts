/**
 * 샘플 상품 → 실제 거래 글 모양(PostWithMeta) (Owner 2026-10-28 「샘플이 실제 게시물과 동일」).
 * 목록 카드는 이 값으로 실제 카드(PostCard)를 그린다 — 가격 줄(페소·월세·급여·환율)·영문 지역 줄·주제 배지가 실제 글과 같은 규칙.
 * 샘플은 posts 에 없다: 찜·채팅·신고·통계 대상 아님(PostCard `showcase` 모드).
 */
import type { PostWithMeta } from "@/lib/posts/schema";
import type { TradeShowcaseItem } from "@/lib/trade/showcase/trade-showcase-model";
import { TRADE_SHOWCASE_LISTINGS, type TradeShowcaseListing } from "@/lib/trade/showcase/trade-showcase-listings";

/** 번호 없는 샘플(어드민 신규) — 지역만 Makati City › Makati – Poblacion, meta 없음 */
const FALLBACK_LISTING: TradeShowcaseListing = {
  trade_lgu_id: "1380300000",
  region: "manila",
  city: "m39",
  meta: {},
};

export const TRADE_SHOWCASE_POST_ID_PREFIX = "showcase-";

export function tradeShowcaseItemToPost(item: TradeShowcaseItem): PostWithMeta {
  const listing = TRADE_SHOWCASE_LISTINGS[item.sort_order] ?? FALLBACK_LISTING;
  const categoryId = item.trade_category_id ?? "";
  return {
    id: `${TRADE_SHOWCASE_POST_ID_PREFIX}${item.id}`,
    category_id: categoryId,
    trade_category_id: categoryId,
    author_id: "",
    type: "trade",
    trade_type: "product",
    title: item.title,
    content: item.description ?? "",
    price: item.price,
    is_price_offer: false,
    is_free_share: false,
    region: listing.region,
    city: listing.city,
    trade_lgu_id: listing.trade_lgu_id,
    barangay: null,
    contact_method: null,
    status: "active",
    seller_listing_state: "inquiry",
    view_count: 0,
    favorite_count: 0,
    thumbnail_url: item.image_urls[0] ?? null,
    images: item.image_urls,
    meta: { ...listing.meta },
    created_at: item.created_at,
    updated_at: item.updated_at,
  } as PostWithMeta;
}
