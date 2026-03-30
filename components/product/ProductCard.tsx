"use client";

import Link from "next/link";
import type { Product } from "@/lib/types/product";
import { formatPrice } from "@/lib/utils/format";
import { TimeAgo } from "@/components/ui/TimeAgo";
import { FavoriteToggleButton } from "@/components/favorites/FavoriteToggleButton";
import {
  TradeListingStatusBadge,
  tradeListingPostFromProduct,
} from "@/components/post/TradeListingStatusBadge";
import {
  POST_LIST_META_LINE_CLASS,
  POST_LIST_META_TEXT_CLASS,
  POST_LIST_PRICE_CLASS,
  POST_LIST_TITLE_CLASS,
  stripPostListBlockTopMargin,
} from "@/lib/posts/post-list-preview-model";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const isSold = product.status === "sold";

  return (
    <Link
      href={`/products/${product.id}`}
      className={`relative flex gap-3 rounded-md bg-white p-3 ${isSold ? "opacity-60" : ""}`}
    >
      <div
        className="absolute right-2 top-2 z-[1]"
        onClick={(e) => e.preventDefault()}
        role="presentation"
      >
        <FavoriteToggleButton productId={product.id} iconClassName="h-5 w-5" />
      </div>
      <div className="relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-md bg-gray-100">
        {product.thumbnail ? (
          <img
            src={product.thumbnail}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-gray-200" />
        )}
        {product.isBoosted && (
          <span className="absolute left-1 top-1 rounded bg-signature px-1.5 py-0.5 text-[10px] font-medium text-white">
            끌올
          </span>
        )}
      </div>
      <div className="flex min-h-[100px] min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col justify-between">
          <div className="shrink-0">
            <TradeListingStatusBadge post={tradeListingPostFromProduct(product)} />
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
            {product.likesCount != null && product.likesCount > 0 ? (
              <p className={POST_LIST_META_LINE_CLASS}>관심 {product.likesCount}</p>
            ) : null}
            <p className={POST_LIST_META_LINE_CLASS}>
              <TimeAgo isoString={product.createdAt} />
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
