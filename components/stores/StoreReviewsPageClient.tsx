"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { StoreReviewsSection } from "@/components/stores/StoreReviewsSection";
import { decodeSlugSegment } from "@/lib/stores/store-consumer-route";

export function StoreReviewsPageClient({ slug }: { slug: string }) {
  const { t } = useI18n();
  const decoded = decodeSlugSegment(slug).trim();
  const keySlug = decoded || slug.trim();

  return (
    <div className="w-full min-w-0 min-h-[100dvh] overflow-x-hidden bg-[#f6f7f9] [-webkit-overflow-scrolling:touch]">
      <div className="min-h-[100dvh] w-full overflow-x-hidden bg-white px-4 pb-10 pt-3">
        <h1 className="mb-3 text-[18px] font-bold text-neutral-900">{t("store_reviews_title")}</h1>
        <StoreReviewsSection storeSlug={keySlug} surface="orderDetail" />
      </div>
    </div>
  );
}
