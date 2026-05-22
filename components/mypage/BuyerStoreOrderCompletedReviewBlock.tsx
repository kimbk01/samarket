"use client";

import Link from "next/link";
import { STORE_ORDER_BRAND } from "@/components/stores/store-order-detail/store-order-brand";
import type { BuyerStoreOrderReviewSummary } from "@/lib/stores/buyer-store-order-review-meta";

function StarRatingRow({ rating, sizeClass = "sam-text-body" }: { rating: number; sizeClass?: string }) {
  const r = Math.min(5, Math.max(0, Math.floor(Number(rating) || 0)));
  return (
    <span className={`inline-flex leading-none text-amber-500 ${sizeClass}`} aria-label={`별점 ${r}점`}>
      {"★".repeat(r)}
      <span className="text-sam-meta">{"☆".repeat(5 - r)}</span>
    </span>
  );
}

type Props = {
  variant?: "detail" | "list";
  listHref: string;
  reviewHref: string;
  storeReviewsHref?: string | null;
  review: BuyerStoreOrderReviewSummary | null;
  canSubmitReview: boolean;
  reviewStatus?: string | null;
  chatHref?: string;
  orderChatDisabled?: boolean;
};

/**
 * 완료 주문 — 별점·리뷰 작성 CTA · 사장님 댓글(매장 리뷰 관리 UI와 동일 톤).
 */
export function BuyerStoreOrderCompletedReviewBlock({
  variant = "detail",
  listHref,
  reviewHref,
  storeReviewsHref,
  review,
  canSubmitReview,
  reviewStatus,
  chatHref,
  orderChatDisabled = false,
}: Props) {
  const compact = variant === "list";
  const ownerReply = review?.owner_reply_content?.trim() ?? "";

  const primaryReviewCta = (
    <Link
      href={reviewHref}
      className={
        compact
          ? "inline-flex min-h-[44px] min-w-0 flex-1 items-center justify-center rounded-ui-rect bg-amber-500 px-2 py-2.5 text-center text-sm font-bold text-white shadow-sm"
          : "inline-flex min-h-12 w-full items-center justify-center rounded-ui-rect bg-amber-500 px-3 py-3 text-center text-sm font-bold text-white shadow-sm"
      }
    >
      ★ 별점 리뷰 작성하기
    </Link>
  );

  const listCta = (
    <Link
      href={listHref}
      className={
        compact
          ? "delivery-ui inline-flex min-h-[44px] min-w-0 flex-1 items-center justify-center rounded-[var(--delivery-radius)] border border-[color:var(--delivery-border)] bg-white px-2 py-2.5 text-center text-sm font-semibold text-[color:var(--delivery-primary)]"
          : "delivery-ui inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--delivery-radius)] border border-[color:var(--delivery-primary)] bg-[color:var(--delivery-primary-soft)] px-3 py-2.5 text-sm font-bold text-[color:var(--delivery-primary)]"
      }
    >
      주문 목록으로
    </Link>
  );

  return (
    <div
      className={
        compact
          ? "mt-2 rounded-[4px] border border-[#DDE5E0] bg-white px-3 py-2.5"
          : "mt-4 rounded-ui-rect border border-[#DDE5E0] bg-[#F6FAFC] px-3 py-3"
      }
    >
      <p className="text-[12px] font-bold leading-[1.35] text-[#123B4A]">배달 평가 · 리뷰</p>

      {canSubmitReview ? (
        <div className="mt-2 space-y-2">
          <p className="text-[13px] leading-[1.45] text-[#6B7280]">
            주문이 완료되었어요. 매장에 별점과 후기를 남겨 주세요. 사장님이 댓글로 답변할 수 있어요.
          </p>
          <div className={`flex gap-2 ${compact ? "flex-col sm:flex-row" : "flex-col sm:flex-row"}`}>
            {primaryReviewCta}
            {listCta}
          </div>
          {!orderChatDisabled && chatHref ? (
            <Link
              href={chatHref}
              className="delivery-ui block text-center text-[13px] font-semibold text-[color:var(--delivery-primary)] underline underline-offset-2"
            >
              주문 채팅 다시 보기
            </Link>
          ) : null}
        </div>
      ) : review ? (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {review.rating > 0 ? (
              <StarRatingRow rating={review.rating} sizeClass={compact ? "text-base" : "sam-text-section-title"} />
            ) : null}
            <span className="text-[12px] font-semibold text-[#123B4A]">내가 남긴 리뷰</span>
          </div>
          {review.content ? (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#123B4A]">{review.content}</p>
          ) : null}
          <p className="text-[12px] leading-snug text-[#6B7280]">
            {review.visible_to_public === false
              ? "비공개 리뷰로 등록되었어요. 다른 고객용 매장 리뷰 목록에는 보이지 않을 수 있습니다."
              : "매장 리뷰 목록에 노출될 수 있어요."}
          </p>
          {ownerReply ? (
            <div
              className="rounded-[12px] px-3 py-2.5"
              style={{ backgroundColor: STORE_ORDER_BRAND.frameGray }}
            >
              <p className="text-[12px] font-bold" style={{ color: STORE_ORDER_BRAND.title }}>
                사장님 댓글
              </p>
              <p
                className="mt-1 whitespace-pre-wrap text-[13px] leading-snug"
                style={{ color: STORE_ORDER_BRAND.secondary }}
              >
                {ownerReply}
              </p>
              {review.owner_reply_created_at ? (
                <p className="mt-1 text-right text-[12px] tabular-nums" style={{ color: STORE_ORDER_BRAND.muted }}>
                  {new Date(review.owner_reply_created_at).toLocaleDateString("ko-KR")}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-[4px] border border-dashed border-[#DDE5E0] bg-white px-3 py-2 text-[12px] text-[#6B7280]">
              아직 사장님 댓글이 없어요. 답변이 오면 여기에 표시됩니다.
            </p>
          )}
          <div className={`flex gap-2 ${compact ? "flex-col sm:flex-row" : "flex-row flex-wrap"}`}>
            {listCta}
            {storeReviewsHref && review.visible_to_public ? (
              <Link
                href={storeReviewsHref}
                className={
                  compact
                    ? "delivery-ui inline-flex min-h-[44px] min-w-0 flex-1 items-center justify-center rounded-[var(--delivery-radius)] border border-[color:var(--delivery-primary)] bg-[color:var(--delivery-primary-soft)] px-2 py-2.5 text-center text-sm font-semibold text-[color:var(--delivery-primary)]"
                    : "delivery-ui inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--delivery-radius)] border border-[color:var(--delivery-primary)] bg-[color:var(--delivery-primary-soft)] px-3 py-2.5 text-sm font-bold text-[color:var(--delivery-primary)]"
                }
              >
                매장 리뷰 보기
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-[13px] text-[#6B7280]">
            {reviewStatus === "unavailable"
              ? "리뷰 기능을 불러오지 못했어요. 잠시 후 다시 확인해 주세요."
              : "리뷰 상태를 확인할 수 없어요."}
          </p>
          {listCta}
        </div>
      )}
    </div>
  );
}
