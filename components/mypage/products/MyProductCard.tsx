"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types/product";
import { formatPrice, formatTimeAgo } from "@/lib/utils/format";
import { tradeListingPostFromProduct } from "@/components/post/TradeListingStatusBadge";
import { resolveMarketplacePublicListingStatus } from "@/lib/trade/marketplace/public-listing-status";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  POST_LIST_META_LINE_CLASS,
  POST_LIST_META_TEXT_CLASS,
  POST_LIST_PRICE_CLASS,
  POST_LIST_TITLE_CLASS,
  stripPostListBlockTopMargin,
} from "@/lib/posts/post-list-preview-model";
import { MyProductActions } from "./MyProductActions";
import { SellerTradeRow } from "@/components/mypage/seller/SellerTradeRow";
import type { SalesHistoryRow } from "@/components/mypage/sales/SalesHistoryCard";
import { beginRouteEntryPerf } from "@/lib/runtime/samarket-runtime-debug";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface MyProductCardProps {
  product: Product;
  isPromoted?: boolean;
  tradeRows?: SalesHistoryRow[];
  onStatusChange: (productId: string, newStatus: Product["status"]) => void;
  onDelete: (productId: string) => void;
}

export function MyProductCard({
  product,
  isPromoted = false,
  tradeRows = [],
  onStatusChange,
  onDelete,
}: MyProductCardProps) {
  const { t, safeT } = useI18n();
  const router = useRouter();
  const listingPost = tradeListingPostFromProduct(product);
  const isSold = resolveMarketplacePublicListingStatus(listingPost) === "sold";
  const isHidden = product.status === "hidden" || product.status === "blinded";
  const detailHref = `/post/${product.id}`;
  const statusLabel = isHidden
    ? t("mypage_comp_product_status_hidden")
    : isSold
      ? safeT("marketplace_seller_listing_status_sold", {
          fallbackKo: "판매완료",
          fallbackEn: "Sold",
        })
      : safeT("marketplace_seller_listing_status_live", {
          fallbackKo: "판매중",
          fallbackEn: "For sale",
        });
  const timeLabel = formatTimeAgo(product.updatedAt ?? product.createdAt);

  return (
    <div className={isSold || isHidden ? "opacity-70" : undefined}>
      <div className="flex gap-3 px-3 py-3">
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
          </div>
          <div className="flex min-h-[100px] min-w-0 flex-1 flex-col justify-between">
            <div className="flex min-h-0 flex-1 flex-col justify-between">
              <p className={`${stripPostListBlockTopMargin(POST_LIST_PRICE_CLASS)} shrink-0`}>
                {formatPrice(product.price)}
              </p>
              <p className={`${stripPostListBlockTopMargin(POST_LIST_TITLE_CLASS)} shrink-0`}>
                {product.title}
              </p>
              {product.location ? (
                <p className={stripPostListBlockTopMargin(POST_LIST_META_TEXT_CLASS)}>
                  {product.location}
                </p>
              ) : null}
              <p className={POST_LIST_META_LINE_CLASS}>
                {statusLabel}
                {timeLabel ? ` · ${timeLabel}` : ""}
              </p>
              {isPromoted ? (
                <span className="mt-0.5 inline-block w-fit shrink-0 rounded bg-sam-app px-1 py-0.5 text-[10px] font-medium text-sam-muted">
                  {safeT("trade_promo_badge", {
                    fallbackKo: "홍보",
                    fallbackEn: "Promoted",
                  })}
                </span>
              ) : null}
            </div>
          </div>
        </Link>
        <MyProductActions
          product={product}
          onStatusChange={onStatusChange}
          onDelete={onDelete}
        />
      </div>
      {tradeRows.map((row) => (
        <SellerTradeRow key={row.chatId || `${row.postId}-${row.buyerId}`} row={row} />
      ))}
    </div>
  );
}
