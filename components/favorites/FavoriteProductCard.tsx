"use client";

import Link from "next/link";
import type { FavoriteProduct } from "@/lib/types/favorite";
import { formatPrice, formatTimeAgo } from "@/lib/utils/format";
import { FavoriteToggleButton } from "./FavoriteToggleButton";
import {
  TradeListingStatusBadge,
  tradeListingPostFromFavorite,
} from "@/components/post/TradeListingStatusBadge";
import {
  POST_LIST_META_LINE_CLASS,
  POST_LIST_META_TEXT_CLASS,
  POST_LIST_PRICE_CLASS,
  POST_LIST_TITLE_CLASS,
  stripPostListBlockTopMargin,
} from "@/lib/posts/post-list-preview-model";

interface FavoriteProductCardProps {
  product: FavoriteProduct;
}

export function FavoriteProductCard({ product }: FavoriteProductCardProps) {
  const isSold = product.status === "sold";

  return (
    <div
      className={`relative flex gap-3 rounded-ui-rect bg-sam-surface p-3 ${isSold ? "opacity-70" : ""}`}
    >
      <div
        className="absolute right-2 top-2 z-[1]"
        onClick={(e) => e.preventDefault()}
        role="presentation"
      >
        <FavoriteToggleButton productId={product.id} iconClassName="h-5 w-5" />
      </div>
      <Link href={`/products/${product.id}`} className="flex min-w-0 flex-1 gap-3">
        <div className="relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
          {product.thumbnail ? (
            <img
              src={product.thumbnail}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-sam-border-soft" />
          )}
          {product.isBoosted && (
            <span className="absolute left-1 top-1 rounded bg-signature px-1.5 py-0.5 sam-text-xxs font-medium text-white">
              끌올
            </span>
          )}
        </div>
        <div className="flex min-h-[100px] min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col justify-between">
            <div className="shrink-0">
              <TradeListingStatusBadge post={tradeListingPostFromFavorite(product)} />
            </div>
            <p className={`${stripPostListBlockTopMargin(POST_LIST_TITLE_CLASS)} shrink-0`}>
              {product.title}
            </p>
            <p className={`${stripPostListBlockTopMargin(POST_LIST_PRICE_CLASS)} shrink-0`}>
              {formatPrice(product.price)}
            </p>
            <div className="flex shrink-0 flex-col">
              <p className={stripPostListBlockTopMargin(POST_LIST_META_TEXT_CLASS)}>
                {product.location}
              </p>
              <p className={POST_LIST_META_LINE_CLASS}>
                {formatTimeAgo(product.createdAt)}
              </p>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
