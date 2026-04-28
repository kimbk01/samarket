"use client";

import {
  POST_LIST_META_LINE_CLASS,
  POST_LIST_PRICE_TEXT_CLASS,
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
}: {
  listingPost: TradeListingPostLike;
  preview: PostListPreviewModel;
  omitListingBadge?: boolean;
  matchThumbnailHeight?: boolean;
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
              <span key={`plain-${idx}`} className={POST_LIST_PRICE_TEXT_CLASS}>
                {part}
              </span>
            );
          }
          return (
            <span key={`tok-${idx}`} className="inline-flex items-baseline gap-1">
              <span className="text-[13px] font-semibold leading-tight text-[#1A1A1A]">{m[1]}</span>
              <span className={POST_LIST_PRICE_TEXT_CLASS}>{m[2]}</span>
            </span>
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
    hasFooter && lf ? (
      <div
        className={`min-w-0 shrink-0 space-y-0.5 ${matchThumbnailHeight ? "mt-0" : "mt-0.5"}`}
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
            ? `shrink-0 ${preview.listingRowClassName} flex-col items-start gap-y-1`
            : `${preview.listingRowClassName} flex-col items-start gap-y-1`
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {!omitListingBadge ? <TradeListingStatusBadge post={listingPost} /> : null}
          {preview.showPipeAfterListingBadge &&
          !omitListingBadge &&
          preview.listingChips.length > 0 ? (
            <span className="mx-1 sam-text-xxs font-medium text-sam-meta" aria-hidden>
              |
            </span>
          ) : null}
          <span className={preview.listingChips[0]!.className}>{preview.listingChips[0]!.text}</span>
          {preview.listingBold ? (
            <span className={POST_LIST_PRICE_TEXT_CLASS}>{preview.listingBold}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
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
        {preview.listingBold ? (
          <span className={POST_LIST_PRICE_TEXT_CLASS}>{preview.listingBold}</span>
        ) : null}
      </div>
    );

  const inner = matchThumbnailHeight ? (
    <>
      <div className="flex min-h-0 flex-1 flex-col justify-start gap-y-0.5">
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
    return <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">{inner}</div>;
  }

  return inner;
}
