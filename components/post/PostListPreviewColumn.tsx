"use client";

import { Fragment } from "react";
import {
  POST_LIST_META_LINE_CLASS,
  POST_LIST_PRICE_TEXT_CLASS,
  POST_LIST_REAL_ESTATE_PRICE_AMOUNT_CLASS,
  POST_LIST_REAL_ESTATE_PRICE_TOKEN_LABEL_CLASS,
  POST_LIST_USED_CAR_ROW_TRAIL_BOLD_CLASS,
  stripPostListBlockTopMargin,
  type PostListPreviewModel,
} from "@/lib/posts/post-list-preview-model";
import {
  TradeListingStatusBadge,
  type TradeListingPostLike,
} from "@/components/post/TradeListingStatusBadge";

/**
 * 피드 PostCard 우측 열 본문 — 채팅 상단 카드에서도 동일 사용
 */
export function PostListPreviewColumn({
  listingPost,
  preview,
  /** 채팅 목록 등 — 거래 배지는 생략하고 칩·가격 줄만 */
  omitListingBadge = false,
  /**
   * PostCard 등 썸네일(h-100)과 같은 최소 높이를 맞추고,
   * 1단(배지·칩)~마지막 줄(본문/푸터) 사이 여백을 썸네일 열 높이에 맞춰 균등 분배
   */
  matchThumbnailHeight = false,
  /**
   * 피드 카드 하단에 작성자·지역·시간을 한 번만 두려면 본문 내 `listFooter`(닉네임·주소 ul) 생략.
   * 채팅·관련상품 미니카드 등은 기본(false) 유지.
   */
  omitListFooter = false,
  /**
   * 기본 true — 우측 본문 열을 썸네일 높이만큼 채움(채팅 상단 카드 등).
   * false — 본문 높이만큼만 차지·거래 피드 카드에서 썸네일 아래 빈 공간 제거(커뮤니티 리스트와 동일 체감).
   */
  stretchPreviewToThumbnailColumn = true,
  /** 거래 피드 카드용 초밀도 간격 (배지줄/본문줄 사이 세로 간격 최소화) */
  compactSpacing = false,
}: {
  listingPost: TradeListingPostLike;
  preview: PostListPreviewModel;
  omitListingBadge?: boolean;
  matchThumbnailHeight?: boolean;
  omitListFooter?: boolean;
  stretchPreviewToThumbnailColumn?: boolean;
  compactSpacing?: boolean;
}) {
  function renderRealEstatePriceLine(text: string) {
    const src = text.trim();
    if (!src) return null;
    const parts = src.split("|").map((s) => s.trim()).filter(Boolean);
    const tokenRe = /^(보증금|월세|매매)\s+(.+)$/;
    return (
      <>
        {parts.map((part, idx) => {
          const m = part.match(tokenRe);
          if (!m) {
            return (
              <Fragment key={`plain-${idx}`}>
                {idx > 0 ? (
                  <span className="mx-1 text-[12px] font-normal text-[#D1D5DB]" aria-hidden>
                    |
                  </span>
                ) : null}
                <span className={POST_LIST_REAL_ESTATE_PRICE_AMOUNT_CLASS}>{part}</span>
              </Fragment>
            );
          }
          return (
            <Fragment key={`tok-${idx}`}>
              {idx > 0 ? (
                <span className="mx-1 text-[12px] font-normal text-[#D1D5DB]" aria-hidden>
                  |
                </span>
              ) : null}
              <span className="inline-flex items-baseline gap-1">
                <span className={POST_LIST_REAL_ESTATE_PRICE_TOKEN_LABEL_CLASS}>{m[1]}</span>
                <span className={POST_LIST_REAL_ESTATE_PRICE_AMOUNT_CLASS}>{m[2]}</span>
              </span>
            </Fragment>
          );
        })}
      </>
    );
  }

  const lf = preview.listFooter;
  const footerSeller = lf?.sellerLine?.trim() ?? "";
  const footerSellerClass = lf?.sellerLineClassName?.trim() || POST_LIST_META_LINE_CLASS;
  const footerItems = lf?.items ?? [];
  const hasFooter = Boolean(lf && (footerSeller || footerItems.length > 0));
  const footerUlClass =
    hasFooter && lf && footerItems.length > 0
      ? matchThumbnailHeight
        ? stripPostListBlockTopMargin(lf.ulClassName)
        : lf.ulClassName
      : null;

  const listFooterBlock =
    !omitListFooter && hasFooter && lf ? (
      <div
        className={`min-w-0 shrink-0 ${compactSpacing ? "space-y-0 mt-0" : `space-y-0.5 ${matchThumbnailHeight ? "mt-0" : "mt-0.5"}`}`}
      >
        {footerSeller ? (
          <p className={`truncate ${footerSellerClass}`} title={footerSeller}>
            {footerSeller}
          </p>
        ) : null}
        {footerUlClass ? (
          <ul className={footerUlClass}>
            {footerItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    ) : null;

  const listingRow =
    preview.listKind === "jobs" && preview.listingChips.length > 1 ? (
      <div
        className={
          matchThumbnailHeight
            ? `shrink-0 ${preview.listingRowClassName} flex-col items-start ${compactSpacing ? "gap-y-0.5" : "gap-y-1"}`
            : `${preview.listingRowClassName} flex-col items-start ${compactSpacing ? "gap-y-0.5" : "gap-y-1"}`
        }
      >
        <div className={`flex flex-wrap items-center ${compactSpacing ? "gap-1" : "gap-1.5"}`}>
          {!omitListingBadge ? <TradeListingStatusBadge post={listingPost} /> : null}
          {preview.showPipeAfterListingBadge &&
          !omitListingBadge &&
          preview.listingChips.length > 0 ? (
            <span className="mx-1 sam-text-xxs font-medium text-sam-meta" aria-hidden>
              |
            </span>
          ) : null}
          <span className={preview.listingChips[0]!.className}>{preview.listingChips[0]!.text}</span>
          {preview.listingRowBoldText?.trim() ? (
            <span className={POST_LIST_USED_CAR_ROW_TRAIL_BOLD_CLASS}>
              {preview.listingRowBoldText.trim()}
            </span>
          ) : null}
          {preview.listingBold ? (
            <span className={POST_LIST_PRICE_TEXT_CLASS}>{preview.listingBold}</span>
          ) : null}
        </div>
        <div className={`flex flex-wrap items-center ${compactSpacing ? "gap-1" : "gap-1.5"}`}>
          {preview.listingChips.slice(1).map((c, i) => (
            <span key={`${c.text}-${i + 1}`} className={c.className}>
              {c.text}
            </span>
          ))}
        </div>
      </div>
    ) : (
      <div
        className={
          matchThumbnailHeight
            ? `shrink-0 ${preview.listingRowClassName}`
            : preview.listingRowClassName
        }
      >
        {!omitListingBadge ? <TradeListingStatusBadge post={listingPost} /> : null}
        {preview.showPipeAfterListingBadge &&
        !omitListingBadge &&
        preview.listingChips.length > 0 ? (
          <span className="mx-1 sam-text-xxs font-medium text-sam-meta" aria-hidden>
            |
          </span>
        ) : null}
        {preview.listingChips.map((c, i) => (
          <span key={`${c.text}-${i}`} className={c.className}>
            {c.text}
          </span>
        ))}
        {preview.listingRowBoldText?.trim() ? (
          <span className={POST_LIST_USED_CAR_ROW_TRAIL_BOLD_CLASS}>
            {preview.listingRowBoldText.trim()}
          </span>
        ) : null}
        {preview.listingBold ? (
          <span className={POST_LIST_PRICE_TEXT_CLASS}>{preview.listingBold}</span>
        ) : null}
      </div>
    );

  const previewStackClass = stretchPreviewToThumbnailColumn
    ? `flex min-h-0 flex-1 flex-col justify-start ${compactSpacing ? "gap-y-0" : "gap-y-0.5"}`
    : `flex flex-col justify-start ${compactSpacing ? "gap-y-0" : "gap-y-0.5"}`;

  const inner = matchThumbnailHeight ? (
    <>
      <div className={previewStackClass}>
        {listingRow}
        {preview.bodyBlocks.map((b, i) => (
          <p key={i} className={`${stripPostListBlockTopMargin(b.className)} shrink-0`}>
            {b.row === "real_estate_price" ? renderRealEstatePriceLine(b.text) : b.text}
          </p>
        ))}
        {listFooterBlock}
      </div>
    </>
  ) : (
    <>
      {listingRow}
      {preview.bodyBlocks.map((b, i) => (
        <p key={i} className={b.className}>
          {b.row === "real_estate_price" ? renderRealEstatePriceLine(b.text) : b.text}
        </p>
      ))}
      {listFooterBlock}
    </>
  );

  if (matchThumbnailHeight) {
    const outerPreviewClass = stretchPreviewToThumbnailColumn
      ? "flex h-full min-h-0 min-w-0 flex-1 flex-col"
      : "flex min-h-0 min-w-0 flex-1 flex-col";
    return <div className={outerPreviewClass}>{inner}</div>;
  }

  return inner;
}
