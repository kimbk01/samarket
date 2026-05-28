"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliverySubpageHeader } from "@/components/stores/chrome/DeliverySubpageHeader";
import { StoreReviewsSection } from "@/components/stores/StoreReviewsSection";
import { decodeSlugSegment } from "@/lib/stores/store-consumer-route";
import { STORE_DETAIL_PAGE } from "@/lib/stores/store-detail-ui";

export function StoreReviewsPageClient({ slug }: { slug: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const decoded = decodeSlugSegment(slug).trim();
  const keySlug = decoded || slug.trim();
  const storeHref = `/stores/${encodeURIComponent(keySlug)}`;

  return (
    <div className={`${STORE_DETAIL_PAGE} w-full min-w-0 min-h-[100dvh] overflow-x-hidden`}>
      <DeliverySubpageHeader
        title={t("store_reviews_title")}
        onBack={() => router.push(storeHref)}
        backLabel={t("nav_back")}
      />
      <div className="bg-white px-4 pb-10 pt-3">
        <StoreReviewsSection storeSlug={keySlug} surface="orderDetail" />
      </div>
    </div>
  );
}
