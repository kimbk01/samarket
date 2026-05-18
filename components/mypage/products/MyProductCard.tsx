"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types/product";
import { formatPrice, formatTimeAgo } from "@/lib/utils/format";
import type { SellerListingState } from "@/lib/products/seller-listing-state";
import {
  TradeListingStatusBadge,
  tradeListingPostFromProduct,
} from "@/components/post/TradeListingStatusBadge";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  POST_LIST_META_LINE_CLASS,
  POST_LIST_META_TEXT_CLASS,
  POST_LIST_PRICE_CLASS,
  POST_LIST_TITLE_CLASS,
  stripPostListBlockTopMargin,
} from "@/lib/posts/post-list-preview-model";
import { MyProductActions } from "./MyProductActions";
import { PostSellerTradeStrip } from "@/components/trade/PostSellerTradeStrip";
import { beginRouteEntryPerf } from "@/lib/runtime/samarket-runtime-debug";

interface MyProductCardProps {
  product: Product;
  onStatusChange: (productId: string, newStatus: Product["status"]) => void;
  onBump: (productId: string) => void;
  onDelete: (productId: string) => void;
  listingSaving?: boolean;
  onSellerListingStateChange: (productId: string, state: SellerListingState) => void;
}

export function MyProductCard({
  product,
  onStatusChange,
  onBump,
  onDelete,
  listingSaving = false,
  onSellerListingStateChange,
}: MyProductCardProps) {
  const router = useRouter();
  const isSold = product.status === "sold";
  const isHidden = product.status === "hidden";
  const detailHref = `/post/${product.id}`;
  return (
    <div
      className={`overflow-hidden rounded-ui-rect bg-sam-surface ${
        isSold || isHidden ? "opacity-70" : ""
      }`}
    >
      <div className="flex gap-3 p-3">
        <Link
          href={detailHref}
          onPointerEnter={() => void router.prefetch(detailHref)}
          onFocus={() => void router.prefetch(detailHref)}
          onClick={() => beginRouteEntryPerf("product_detail", detailHref)}
          className="flex min-w-0 flex-1 gap-3"
        >
          <div className="relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
            <SamarketThumbnail
              src={product.thumbnail}
              fill
              roundedClassName="rounded-ui-rect"
              className="bg-sam-surface-muted"
            />
            {product.isBoosted && (
              <span className="absolute left-1 top-1 rounded bg-signature px-1.5 py-0.5 sam-text-xxs font-medium text-white">
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
                <p className={POST_LIST_META_LINE_CLASS}>
                  {formatTimeAgo(product.updatedAt ?? product.createdAt)}
                </p>
              </div>
            </div>
            <p className="mt-1 sam-text-xxs leading-snug text-signature">
              아래에서 구매자별 거래완료를 바로 처리할 수 있어요.
            </p>
          </div>
        </Link>
        <MyProductActions
          product={product}
          onStatusChange={onStatusChange}
          onSellerListingStateChange={onSellerListingStateChange}
          listingSaving={listingSaving}
          onBump={onBump}
          onDelete={onDelete}
        />
      </div>
      <PostSellerTradeStrip postId={product.id} isSeller variant="compact" />
    </div>
  );
}
