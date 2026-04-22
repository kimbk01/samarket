"use client";

import Link from "next/link";
import type { ChatProductSummary as ChatProductSummaryType } from "@/lib/types/chat";
import type { SellerListingState } from "@/lib/products/seller-listing-state";
import { formatPrice, formatTimeAgo } from "@/lib/utils/format";
import { getAppSettings } from "@/lib/app-settings";
import { CURRENCY_SYMBOLS } from "@/lib/exchange/form-options";
import { PostFavoriteButton } from "@/components/favorites/PostFavoriteButton";
import { PostListPreviewColumn } from "@/components/post/PostListPreviewColumn";
import { TradeListingStatusBadge } from "@/components/post/TradeListingStatusBadge";
import { trimPreviewForChatHeader } from "@/lib/chats/chat-list-preview-trim";
import { APP_FEED_LIST_CARD_SHELL } from "@/lib/ui/app-feed-card";
import {
  formatMessengerTradeDockPriceLine,
  messengerTradeDockLine1,
  MessengerTradeProductDockRow,
} from "@/components/community-messenger/room/phase2/MessengerTradeProductDockRow";
import { normalizeSellerListingState, SELLER_LISTING_LABEL } from "@/lib/products/seller-listing-state";

interface ChatProductSummaryProps {
  product: ChatProductSummaryType;
  /** 판매자 본인 채팅방이면 찜 컬럼 숨김 */
  hideFavorite?: boolean;
  /** 글 작성자(판매자) — 본인 글 찜 방지용 */
  sellerUserId?: string;
  /** 채팅방에서 즉시 반영되는 거래 단계(실시간·낙관적) — DB `product` 보다 우선 */
  sellerListingStateOverride?: SellerListingState | string | null;
  /** posts.status Realtime 도 같이 반영해 sold/reserved 뱃지를 즉시 맞춘다 */
  productStatusOverride?: string | null;
  /** 메신저 거래 독: ⋮ 메뉴와 동일한 콤팩트 48px 썸네일·2줄 */
  variant?: "card" | "messengerDock";
}

export function ChatProductSummary({
  product,
  hideFavorite = false,
  sellerUserId,
  sellerListingStateOverride,
  productStatusOverride,
  variant = "card",
}: ChatProductSummaryProps) {
  const currency = getAppSettings().defaultCurrency ?? "KRW";
  const detailHref = product.detailHref?.trim() || `/post/${product.id}`;
  const isPhilifeCard = detailHref.startsWith("/philife/") || detailHref.startsWith("/community/");

  const rel =
    product.updatedAt && !Number.isNaN(Date.parse(product.updatedAt))
      ? formatTimeAgo(product.updatedAt)
      : null;

  const listingPost = {
    seller_listing_state: sellerListingStateOverride ?? product.sellerListingState,
    status: productStatusOverride ?? product.status,
    type: "trade" as const,
  };

  const headerPreview = product.listPreview
    ? trimPreviewForChatHeader(product.listPreview)
    : null;

  const isExchange = product.isExchangePost === true;
  const exchangePhp = isExchange ? product.exchangePhpAmount : null;

  const listingPhaseLabel = SELLER_LISTING_LABEL[
    normalizeSellerListingState(sellerListingStateOverride, productStatusOverride ?? product.status)
  ];

  if (variant === "messengerDock" && !isPhilifeCard) {
    const line1 = messengerTradeDockLine1(product.title, headerPreview);
    const line2 = isExchange
      ? exchangePhp != null && Number.isFinite(exchangePhp)
        ? formatMessengerTradeDockPriceLine(Number(exchangePhp), "PHP", listingPhaseLabel)
        : `금액 문의 · ${listingPhaseLabel}`
      : formatMessengerTradeDockPriceLine(product.price, currency, listingPhaseLabel);

    return (
      <div className="flex min-w-0 items-stretch justify-between gap-2">
        <div className="min-w-0 flex-1">
          <MessengerTradeProductDockRow
            thumbnailUrl={product.thumbnail?.trim() ? product.thumbnail.trim() : null}
            line1={line1}
            line2={line2}
            detailHref={detailHref}
            productLabel={(product.title || "상품").trim()}
          />
        </div>
        {!hideFavorite ? (
          <div className="flex shrink-0 items-center self-center border-l border-[color:var(--cm-room-divider)] px-2">
            <PostFavoriteButton postId={product.id} authorUserId={sellerUserId} iconClassName="h-5 w-5" />
          </div>
        ) : null}
      </div>
    );
  }

  const exchangeRateLine = isExchange ? product.exchangeRateSubLine : null;
  const useLegacy = !headerPreview;

  const thumbExchange =
    (headerPreview?.thumbnailMode === "exchange" || (useLegacy && isExchange)) && !product.thumbnail;

  return (
    <div
      className={`flex items-stretch overflow-hidden transition-shadow hover:shadow-[0_3px_8px_rgba(0,0,0,0.12)] ${APP_FEED_LIST_CARD_SHELL}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5 p-3 sm:items-stretch sm:gap-3.5 md:gap-4">
        {/*
          피드 PostCard 와 동일하게 썸네일은 고정 정사각 — self-stretch 금지(텍스트 열이 길어질 때 세로로 늘어나 모바일에서 과도한 높이).
          좁은 화면에서는 88px 로 조금 더 작게.
        */}
        <Link
          href={detailHref}
          className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-ui-rect bg-sam-primary-soft transition active:opacity-90 sm:h-[100px] sm:w-[100px]"
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
              className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-emerald-50 text-2xl font-semibold text-sam-fg"
              aria-hidden
            >
              <span>{CURRENCY_SYMBOLS.PHP}</span>
              <span className="sam-text-xxs text-sam-muted">↔</span>
              <span>{CURRENCY_SYMBOLS.KRW}</span>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center sam-text-xxs text-sam-meta" aria-hidden>
              이미지
            </div>
          )}
        </Link>
        <div className="flex min-h-[88px] min-w-0 flex-1 flex-col justify-center sm:min-h-[100px] md:min-h-0 md:justify-start">
          {headerPreview && !isPhilifeCard ? (
            <>
              <Link
                href={detailHref}
                className="flex min-h-0 min-w-0 flex-1 flex-col text-left transition active:bg-sam-app/0"
                aria-label={`${product.title || "상품"} 상세 보기`}
              >
                <PostListPreviewColumn
                  listingPost={listingPost}
                  preview={headerPreview}
                  matchThumbnailHeight
                />
              </Link>
              {(product.regionLabel || rel) && (
                <div className="mt-1 flex shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 sam-text-xxs text-muted">
                  {product.regionLabel ? (
                    <>
                      <span className="shrink-0">{product.regionLabel}</span>
                      {rel ? (
                        <span className="text-sam-meta" aria-hidden>
                          ·
                        </span>
                      ) : null}
                    </>
                  ) : null}
                  {rel ? <span className="shrink-0 text-sam-muted">{rel}</span> : null}
                </div>
              )}
            </>
          ) : (
            <Link
              href={detailHref}
              className="block text-left transition active:bg-sam-app/0"
              aria-label={`${product.title || "상품"} 상세 보기`}
            >
              {!isPhilifeCard ? (
                <TradeListingStatusBadge post={listingPost} size="list" className="mb-1 block max-w-full shrink-0" />
              ) : null}
              <p className="line-clamp-2 sam-text-body-secondary font-medium leading-snug text-sam-fg">
                {product.title || "상품"}
              </p>
              {!isPhilifeCard ? (
                <p className="mt-0.5 sam-text-body font-bold text-sam-fg">
                  {isExchange ? (
                    exchangePhp != null ? (
                      <>
                        {CURRENCY_SYMBOLS.PHP} {exchangePhp.toLocaleString()}
                      </>
                    ) : (
                      <span className="sam-text-body font-semibold text-sam-muted">금액 문의</span>
                    )
                  ) : (
                    formatPrice(product.price, currency)
                  )}
                </p>
              ) : null}
              {!isPhilifeCard && isExchange ? (
                <p className="mt-0.5 sam-text-helper font-medium text-sam-fg">
                  {exchangeRateLine ? (
                    <>환율 {exchangeRateLine}</>
                  ) : (
                    <span className="text-muted">환율 미지정</span>
                  )}
                </p>
              ) : null}
              {(product.regionLabel || rel) && (
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 sam-text-xxs text-muted">
                  {product.regionLabel ? (
                    <>
                      <span className="shrink-0">{product.regionLabel}</span>
                      {rel ? (
                        <span className="text-sam-meta" aria-hidden>
                          ·
                        </span>
                      ) : null}
                    </>
                  ) : null}
                  {rel ? <span className="shrink-0 text-sam-muted">{rel}</span> : null}
                </div>
              )}
            </Link>
          )}
        </div>
      </div>
      {!hideFavorite && !isPhilifeCard && (
        <div className="flex shrink-0 items-center border-l border-sam-border-soft px-2">
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
