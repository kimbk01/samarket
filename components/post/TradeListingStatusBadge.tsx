"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { Product } from "@/lib/types/product";
import type { FavoriteProduct } from "@/lib/types/favorite";
import { productStatusLabel } from "@/lib/mypage/seller-listing-i18n";
import { listTradeStatusBadge } from "@/lib/products/seller-listing-state";
import { isTradeListingPost } from "@/lib/posts/is-trade-listing-post";
import {
  APP_FEED_LIST_ROW1_LAYOUT,
  APP_FEED_LIST_ROW1_TEXT_DETAIL,
  APP_FEED_LIST_ROW1_TEXT_LIST,
} from "@/lib/ui/app-feed-list-row1";

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
  const { t } = useI18n();
  const textSize = size === "detail" ? APP_FEED_LIST_ROW1_TEXT_DETAIL : APP_FEED_LIST_ROW1_TEXT_LIST;
  if (!isTradeListingPost(post)) {
    const st = (post.status ?? "").toLowerCase();
    if (st === "sold") return null;
    const label =
      st === "active" || st === "reserved" || st === "hidden"
        ? productStatusLabel(t, st as "active" | "reserved" | "hidden")
        : (post.status ?? "");
    return (
      <span
        className={`${APP_FEED_LIST_ROW1_LAYOUT} ${textSize} border border-sam-border bg-sam-surface text-sam-muted ${className}`.trim()}
      >
        {label}
      </span>
    );
  }
  const badge = listTradeStatusBadge(post.seller_listing_state, post.status, size, t);
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
