"use client";

import Link from "next/link";
import type { ChatProductSummary as ChatProductSummaryType } from "@/lib/types/chat";
import { formatPrice, formatTimeAgo } from "@/lib/utils/format";
import { getAppSettings } from "@/lib/app-settings";
import { CURRENCY_SYMBOLS } from "@/lib/exchange/form-options";
import { PostFavoriteButton } from "@/components/favorites/PostFavoriteButton";
import { PostListPreviewColumn } from "@/components/post/PostListPreviewColumn";
import { trimPreviewForChatHeader } from "@/lib/chats/chat-list-preview-trim";
import { APP_FEED_LIST_CARD_SHELL } from "@/lib/ui/app-feed-card";

interface ChatProductSummaryProps {
  product: ChatProductSummaryType;
  /** 판매자 본인 채팅방이면 찜 컬럼 숨김 */
  hideFavorite?: boolean;
  /** 글 작성자(판매자) — 본인 글 찜 방지용 */
  sellerUserId?: string;
}

export function ChatProductSummary({
  product,
  hideFavorite = false,
  sellerUserId,
}: ChatProductSummaryProps) {
  const currency = getAppSettings().defaultCurrency ?? "KRW";
  const detailHref = product.detailHref?.trim() || `/post/${product.id}`;
  const isPhilifeCard = detailHref.startsWith("/philife/") || detailHref.startsWith("/community/");

  const rel =
    product.updatedAt && !Number.isNaN(Date.parse(product.updatedAt))
      ? formatTimeAgo(product.updatedAt)
      : null;

  const listingPost = {
    seller_listing_state: product.sellerListingState,
    status: product.status,
    type: "trade" as const,
  };

  const headerPreview = product.listPreview
    ? trimPreviewForChatHeader(product.listPreview)
    : null;

  const isExchange = product.isExchangePost === true;
  const exchangePhp = isExchange ? product.exchangePhpAmount : null;
  const exchangeRateLine = isExchange ? product.exchangeRateSubLine : null;
  const useLegacy = !headerPreview;

  const thumbExchange =
    (headerPreview?.thumbnailMode === "exchange" || (useLegacy && isExchange)) && !product.thumbnail;

  return (
    <div
      className={`flex items-stretch overflow-hidden transition-shadow hover:shadow-[0_3px_8px_rgba(0,0,0,0.12)] ${APP_FEED_LIST_CARD_SHELL}`}
    >
      <div className="flex min-w-0 flex-1 items-stretch gap-3 p-3">
        <Link
          href={detailHref}
          className="relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-ui-rect bg-ig-highlight transition active:opacity-90"
          aria-label={`${product.title || "상품"} 썸네일 상세 보기`}
        >
          {product.thumbnail ? (
            <img
              src={product.thumbnail}
              alt=""
              className="h-full w-full object-cover object-center"
              loading="lazy"
            />
          ) : thumbExchange ? (
            <div
              className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-emerald-50 text-2xl font-semibold text-gray-700"
              aria-hidden
            >
              <span>{CURRENCY_SYMBOLS.PHP}</span>
              <span className="text-[10px] text-gray-500">↔</span>
              <span>{CURRENCY_SYMBOLS.KRW}</span>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] text-gray-400" aria-hidden>
              이미지
            </div>
          )}
        </Link>
        <div className="flex min-h-[100px] min-w-0 flex-1 flex-col">
          {headerPreview && !isPhilifeCard ? (
            <>
              <Link
                href={detailHref}
                className="flex min-h-0 min-w-0 flex-1 flex-col text-left transition active:bg-gray-50/0"
                aria-label={`${product.title || "상품"} 상세 보기`}
              >
                <PostListPreviewColumn
                  listingPost={listingPost}
                  preview={headerPreview}
                  omitListingBadge
                  matchThumbnailHeight
                />
              </Link>
              {(product.regionLabel || rel) && (
                <div className="mt-1 flex shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted">
                  {product.regionLabel ? (
                    <>
                      <span className="shrink-0">{product.regionLabel}</span>
                      {rel ? (
                        <span className="text-gray-300" aria-hidden>
                          ·
                        </span>
                      ) : null}
                    </>
                  ) : null}
                  {rel ? <span className="shrink-0 text-gray-500">{rel}</span> : null}
                </div>
              )}
            </>
          ) : (
            <Link
              href={detailHref}
              className="block text-left transition active:bg-gray-50/0"
              aria-label={`${product.title || "상품"} 상세 보기`}
            >
              <p className="line-clamp-2 text-[13px] font-medium leading-snug text-gray-900">
                {product.title || "상품"}
              </p>
              {!isPhilifeCard ? (
                <p className="mt-0.5 text-[15px] font-bold text-gray-900">
                  {isExchange ? (
                    exchangePhp != null ? (
                      <>
                        {CURRENCY_SYMBOLS.PHP} {exchangePhp.toLocaleString()}
                      </>
                    ) : (
                      <span className="text-[14px] font-semibold text-gray-600">금액 문의</span>
                    )
                  ) : (
                    formatPrice(product.price, currency)
                  )}
                </p>
              ) : null}
              {!isPhilifeCard && isExchange ? (
                <p className="mt-0.5 text-[12px] font-medium text-gray-700">
                  {exchangeRateLine ? (
                    <>환율 {exchangeRateLine}</>
                  ) : (
                    <span className="text-muted">환율 미지정</span>
                  )}
                </p>
              ) : null}
              {(product.regionLabel || rel) && (
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted">
                  {product.regionLabel ? (
                    <>
                      <span className="shrink-0">{product.regionLabel}</span>
                      {rel ? (
                        <span className="text-gray-300" aria-hidden>
                          ·
                        </span>
                      ) : null}
                    </>
                  ) : null}
                  {rel ? <span className="shrink-0 text-gray-500">{rel}</span> : null}
                </div>
              )}
            </Link>
          )}
        </div>
      </div>
      {!hideFavorite && !isPhilifeCard && (
        <div className="flex shrink-0 items-center border-l border-gray-100 px-2">
          <PostFavoriteButton
            postId={product.id}
            authorUserId={sellerUserId}
            iconClassName="h-5 w-5"
          />
        </div>
      )}
    </div>
  );
}

export { ChatProductSummary as ChatItemCard };
