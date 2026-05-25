"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import Link from "next/link";
import { HistoryBackTextLink } from "@/components/navigation/HistoryBackTextLink";
import { StoreCommerceOrderDetailClient } from "@/components/stores/StoreCommerceOrderDetailClient";
import { isLikelyUuid } from "@/lib/stores/is-likely-uuid";

/** `/stores/[slug]/order/[orderId]` — UUID만 실매장 주문 상세. 샘플·시뮬 주문 경로는 제거됨. */
export function RestaurantOrderDetailClient({
  storeSlug,
  orderId,
}: {
  storeSlug: string;
  orderId: string;
}) {
  const { t } = useI18n();
  if (isLikelyUuid(orderId)) {
    return <StoreCommerceOrderDetailClient storeSlug={storeSlug} orderId={orderId} />;
  }

  return (
    <div className="px-4 py-12 text-center">
      <div className="mb-4 text-left">
        <HistoryBackTextLink
          fallbackHref={`/stores/${encodeURIComponent(storeSlug)}`}
          className="text-sm text-signature"
          aria-label={t("store_back_to_store_aria")}
        >
          {t("store_back_to_store_short")}
        </HistoryBackTextLink>
      </div>
      <p className="text-sm text-sam-muted">{t("store_order_not_found")}</p>
      <p className="mt-2 text-sm text-sam-muted">
        {t("store_order_check_my_delivery_hint")}
      </p>
      <Link
        href="/my/store-orders"
        className="mt-4 inline-block text-sm font-medium text-signature underline"
      >
        {t("store_my_delivery_orders")}
      </Link>
      <Link href="/stores" className="mt-4 block text-sm text-signature">
        {t("store_stores_home")}
      </Link>
    </div>
  );
}
