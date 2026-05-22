"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { STORE_ORDER_TOUCH_BTN } from "@/components/stores/store-order-detail/store-order-brand";

export function StoreBaeminProductDetailInfo({
  storeSlug,
  productId,
  title,
  summary,
  reviewCount,
  badges,
}: {
  storeSlug: string;
  productId: string;
  title: string;
  summary: string | null;
  reviewCount: number;
  badges: string[];
}) {
  const { t } = useI18n();
  const reviewsHref =
    reviewCount > 0
      ? `/stores/${encodeURIComponent(storeSlug)}/reviews`
      : `/stores/${encodeURIComponent(storeSlug)}/p/${encodeURIComponent(productId)}`;

  return (
    <div className="bg-white px-4 pb-4 pt-4">
      {badges.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {badges.map((b) => (
            <span
              key={b}
              className="inline-flex rounded-full bg-[#F2F3F5] px-2 py-0.5 text-[11px] font-semibold text-[#555555]"
            >
              {b}
            </span>
          ))}
        </div>
      ) : null}

      <h1 className="text-[20px] font-extrabold leading-snug tracking-[-0.03em] text-[#111111]">
        {title}
      </h1>

      {summary?.trim() ? (
        <p className="mt-2 text-[13px] font-medium leading-relaxed text-[#666666]">{summary.trim()}</p>
      ) : null}

      <Link
        href={reviewsHref}
        className={`mt-2.5 inline-flex items-center text-[13px] font-bold text-[#111111] underline-offset-2 hover:underline ${STORE_ORDER_TOUCH_BTN}`}
      >
        {t("store_menu_review_link", { count: reviewCount })}
      </Link>
    </div>
  );
}
