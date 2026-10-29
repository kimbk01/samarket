"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { STORE_ORDER_TOUCH_BTN } from "@/components/stores/store-order-detail/store-order-brand";
import { StoreSampleStoreBadge } from "@/components/stores/StoreSampleStoreBadge";

export function StoreBaeminProductDetailInfo({
  storeSlug,
  productId,
  title,
  summary,
  reviewCount,
  badges,
  isSampleStore,
}: {
  storeSlug: string;
  productId: string;
  title: string;
  summary: string | null;
  reviewCount: number;
  badges: string[];
  /** v4 W3 PL-02 — 부모 매장 샘플(실제 주문 불가) */
  isSampleStore?: boolean;
}) {
  const { t } = useI18n();
  const reviewsHref =
    reviewCount > 0
      ? `/stores/${encodeURIComponent(storeSlug)}/reviews`
      : `/stores/${encodeURIComponent(storeSlug)}/p/${encodeURIComponent(productId)}`;

  return (
    <div className="bg-white px-4 pb-4 pt-4">
      <StoreSampleStoreBadge isSampleStore={isSampleStore} className="mb-2" />
      {badges.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <span
              key={b}
              className="inline-flex rounded-full bg-sam-surface-muted px-2 py-0.5 text-[11px] font-semibold text-sam-muted"
            >
              {b}
            </span>
          ))}
        </div>
      ) : null}

      <h1 className="text-[20px] font-extrabold leading-snug tracking-[-0.03em] text-sam-fg">
        {title}
      </h1>

      {summary?.trim() ? (
        <p className="mt-2 text-[13px] font-medium leading-relaxed text-sam-muted">{summary.trim()}</p>
      ) : null}

      <Link
        href={reviewsHref}
        className={`mt-2.5 inline-flex items-center text-[13px] font-bold text-sam-fg underline-offset-2 hover:underline ${STORE_ORDER_TOUCH_BTN}`}
      >
        {t("store_menu_review_link", { count: reviewCount })}
      </Link>
    </div>
  );
}
