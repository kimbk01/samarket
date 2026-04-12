"use client";

import type { Product } from "@/lib/types/product";
import type { FavoriteProduct } from "@/lib/types/favorite";
import { listTradeStatusBadge } from "@/lib/products/seller-listing-state";
import { isTradeListingPost } from "@/lib/posts/is-trade-listing-post";
import {
  APP_FEED_LIST_ROW1_LAYOUT,
  APP_FEED_LIST_ROW1_TEXT_DETAIL,
  APP_FEED_LIST_ROW1_TEXT_LIST,
} from "@/lib/ui/app-feed-list-row1";

const STATUS_LABEL: Record<string, string> = {
  active: "판매중",
  reserved: "예약중",
  sold: "거래완료",
  hidden: "숨김",
};

/** 글·상품·찜 카드 공통 — status/type 스키마가 달라도 문자열로 통일 */
export type TradeListingPostLike = {
  seller_listing_state?: string;
  status?: string;
  type?: string | null;
};

/** posts 행 기준 — 중고·부동산·차·알바·환전 리스트·상세·채팅 상단과 동일 규칙 */
export function TradeListingStatusBadge({
  post,
  size = "list",
  className = "",
}: {
  post: TradeListingPostLike;
  size?: "list" | "detail";
  className?: string;
}) {
  const textSize = size === "detail" ? APP_FEED_LIST_ROW1_TEXT_DETAIL : APP_FEED_LIST_ROW1_TEXT_LIST;
  if (!isTradeListingPost(post)) {
    const st = (post.status ?? "").toLowerCase();
    if (st === "sold") return null;
    return (
      <span
        className={`${APP_FEED_LIST_ROW1_LAYOUT} ${textSize} border border-sam-border bg-sam-surface text-sam-muted ${className}`.trim()}
      >
        {STATUS_LABEL[post.status ?? ""] ?? post.status ?? ""}
      </span>
    );
  }
  const badge = listTradeStatusBadge(post.seller_listing_state, post.status, size);
  if (!badge) return null;
  return (
    <span className={`${badge.className} ${className}`.trim()}>
      {badge.label}
    </span>
  );
}

export function tradeListingPostFromProduct(p: Product): TradeListingPostLike {
  return {
    seller_listing_state: p.sellerListingState,
    status: p.status,
    type: undefined,
  };
}

export function tradeListingPostFromFavorite(p: FavoriteProduct): TradeListingPostLike {
  return {
    seller_listing_state: p.sellerListingState,
    status: p.status,
    type: undefined,
  };
}
