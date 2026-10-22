"use client";

import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DeliverySubpageHeader } from "@/components/stores/chrome/DeliverySubpageHeader";
import { StoreReviewsSection } from "@/components/stores/StoreReviewsSection";
import { decodeSlugSegment } from "@/lib/stores/store-consumer-route";
import { STORE_DETAIL_PAGE } from "@/lib/stores/store-detail-ui";
import { useStoreDetailBackPress } from "@/components/stores/StoreDetailBackRow";
import { STORES_HOME_CONTENT_COLUMN_CLASS } from "@/lib/stores/stores-home-ui";

export function StoreReviewsPageClient({ slug }: { slug: string }) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const decoded = decodeSlugSegment(slug).trim();
  const keySlug = decoded || slug.trim();
  /** S3-06 — 닫기 = 배달 Back SSOT(`resolveDibayBackTarget`) — 매장 PUSH 하드코딩 금지 */
  const onClose = useStoreDetailBackPress(keySlug);
  const initialProductId = searchParams.get("product")?.trim() || null;
  const initialPhotoOnly = searchParams.get("photo") === "1";

  return (
    <div className={`${STORE_DETAIL_PAGE} w-full min-w-0 min-h-[100dvh] overflow-x-hidden`}>
      <DeliverySubpageHeader
        title={t("store_reviews_title")}
        backVariant="close"
        onBack={onClose}
        backLabel={t("common_close")}
      />
      {/* S3-07 — 본문 폭 = 배달 소비자 768px 열 */}
      <div className={`${STORES_HOME_CONTENT_COLUMN_CLASS} bg-white px-4 pb-10 pt-3`}>
        <StoreReviewsSection
          storeSlug={keySlug}
          surface="orderDetail"
          initialProductId={initialProductId}
          initialPhotoOnly={initialPhotoOnly}
        />
      </div>
    </div>
  );
}
