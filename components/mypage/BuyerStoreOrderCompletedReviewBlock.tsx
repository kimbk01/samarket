"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { STORE_ORDER_BRAND } from "@/components/stores/store-order-detail/store-order-brand";
import type { BuyerStoreOrderReviewSummary } from "@/lib/stores/buyer-store-order-review-meta";

function StarRatingRow({
  rating,
  sizeClass = "sam-text-body",
  ratingAria,
}: {
  rating: number;
  sizeClass?: string;
  ratingAria: string;
}) {
  const r = Math.min(5, Math.max(0, Math.floor(Number(rating) || 0)));
  return (
    <span className={`inline-flex leading-none text-amber-500 ${sizeClass}`} aria-label={ratingAria}>
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
  const { t, language } = useI18n();
  const compact = variant === "list";
  const ownerReply = review?.owner_reply_content?.trim() ?? "";
  const dateLocale = language === "en" ? "en-US" : "ko-KR";

  const primaryReviewCta = (
    <Link
      href={reviewHref}
      className={
        compact
          ? "inline-flex min-h-[44px] min-w-0 flex-1 items-center justify-center rounded-ui-rect bg-amber-500 px-2 py-2.5 text-center text-sm font-bold text-white shadow-sm"
          : "inline-flex min-h-12 w-full items-center justify-center rounded-ui-rect bg-amber-500 px-3 py-3 text-center text-sm font-bold text-white shadow-sm"
      }
    >
      {t("mypage_comp_store_review_write_star_cta")}
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
      {t("mypage_comp_back_to_order_list")}
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
      <p className="text-[12px] font-bold leading-[1.35] text-[#123B4A]">{t("mypage_comp_delivery_review_heading")}</p>

      {canSubmitReview ? (
        <div className="mt-2 space-y-2">
          <p className="text-[13px] leading-[1.45] text-[#6B7280]">{t("mypage_comp_delivery_review_submit_prompt")}</p>
          <div className={`flex gap-2 ${compact ? "flex-col sm:flex-row" : "flex-col sm:flex-row"}`}>
            {primaryReviewCta}
            {listCta}
          </div>
          {!orderChatDisabled && chatHref ? (
            <Link
              href={chatHref}
              className="delivery-ui block text-center text-[13px] font-semibold text-[color:var(--delivery-primary)] underline underline-offset-2"
            >
              {t("mypage_comp_order_chat_revisit")}
            </Link>
          ) : null}
        </div>
      ) : review ? (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {review.rating > 0 ? (
              <StarRatingRow
                rating={review.rating}
                sizeClass={compact ? "text-base" : "sam-text-section-title"}
                ratingAria={t("mypage_comp_store_review_rating_aria", { n: review.rating })}
              />
            ) : null}
            <span className="text-[12px] font-semibold text-[#123B4A]">{t("mypage_comp_my_review_label")}</span>
          </div>
          {review.content ? (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#123B4A]">{review.content}</p>
          ) : null}
          <p className="text-[12px] leading-snug text-[#6B7280]">
            {review.visible_to_public === false
              ? t("mypage_comp_review_private_list_hint")
              : t("mypage_comp_review_public_list_hint")}
          </p>
          {ownerReply ? (
            <div
              className="rounded-[12px] px-3 py-2.5"
              style={{ backgroundColor: STORE_ORDER_BRAND.frameGray }}
            >
              <p className="text-[12px] font-bold" style={{ color: STORE_ORDER_BRAND.title }}>
                {t("store_owner_reply")}
              </p>
              <p
                className="mt-1 whitespace-pre-wrap text-[13px] leading-snug"
                style={{ color: STORE_ORDER_BRAND.secondary }}
              >
                {ownerReply}
              </p>
              {review.owner_reply_created_at ? (
                <p className="mt-1 text-right text-[12px] tabular-nums" style={{ color: STORE_ORDER_BRAND.muted }}>
                  {new Date(review.owner_reply_created_at).toLocaleDateString(dateLocale)}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-[4px] border border-dashed border-[#DDE5E0] bg-white px-3 py-2 text-[12px] text-[#6B7280]">
              {t("mypage_comp_owner_reply_pending")}
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
                {t("mypage_comp_view_store_reviews")}
              </Link>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-[13px] text-[#6B7280]">
            {reviewStatus === "unavailable"
              ? t("mypage_comp_review_feature_unavailable")
              : t("mypage_comp_review_status_unknown")}
          </p>
          {listCta}
        </div>
      )}
    </div>
  );
}
