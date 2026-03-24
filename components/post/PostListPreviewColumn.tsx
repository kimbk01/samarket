"use client";

import {
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
  const footerUlClassStacked =
    matchThumbnailHeight && preview.listFooter
      ? stripPostListBlockTopMargin(preview.listFooter.ulClassName)
      : null;
  const footerUlClassPlain = preview.listFooter?.ulClassName;

  const listingRow = (
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
        <span className="mx-1 text-[11px] font-medium text-gray-300" aria-hidden>
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
      <div className="flex min-h-0 flex-1 flex-col justify-between">
        {listingRow}
        {preview.bodyBlocks.map((b, i) => (
          <p
            key={i}
            className={`${stripPostListBlockTopMargin(b.className)} shrink-0`}
          >
            {b.text}
          </p>
        ))}
        {preview.listFooter &&
        preview.listFooter.items.length > 0 &&
        footerUlClassStacked ? (
          <ul className={`${footerUlClassStacked} shrink-0`}>
            {preview.listFooter.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  ) : (
    <>
      {listingRow}
      {preview.bodyBlocks.map((b, i) => (
        <p key={i} className={b.className}>
          {b.text}
        </p>
      ))}
      {preview.listFooter &&
      preview.listFooter.items.length > 0 &&
      footerUlClassPlain ? (
        <ul className={footerUlClassPlain}>
          {preview.listFooter.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </>
  );

  if (matchThumbnailHeight) {
    return <div className="flex min-h-0 min-w-0 flex-1 flex-col">{inner}</div>;
  }

  return inner;
}
