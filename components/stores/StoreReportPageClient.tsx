"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { STORE_DETAIL_SUBHEADER_STICKY } from "@/lib/stores/store-detail-ui";
import { StoreReportForm } from "@/components/stores/StoreReportForm";

export function StoreReportPageClient({
  slug,
  productId,
}: {
  slug: string;
  productId?: string;
}) {
  const { t } = useI18n();
  const safeSlug = typeof slug === "string" ? slug : "";
  const mode = productId ? "product" : "store";

  if (!safeSlug) {
    return (
      <div className="min-h-screen bg-sam-app p-4">
        <p className="text-sm text-sam-muted">{t("store_invalid_address")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-sam-app">
      <header className={`${STORE_DETAIL_SUBHEADER_STICKY} flex items-center justify-center px-4 py-2.5`}>
        <h1 className="truncate text-center sam-text-body-lg font-semibold text-sam-fg">
          {mode === "product" ? "상품 신고" : "매장 신고"}
        </h1>
      </header>
      <div className="mx-4 mt-4 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <StoreReportForm storeSlug={safeSlug} mode={mode} productId={productId} />
      </div>
    </div>
  );
}
