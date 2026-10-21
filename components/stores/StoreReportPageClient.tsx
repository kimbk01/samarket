"use client";

import { StoreSubpageHeaderBar } from "@/components/stores/StoreSubpageHeaderBar";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
      <StoreSubpageHeaderBar
        as="h1"
        title={mode === "product" ? t("store_report_product") : t("store_report_store")}
        storeSlug={safeSlug}
      />
      <div className="mx-4 mt-4 rounded-ui-rect border border-sam-border-soft bg-sam-surface p-4 shadow-sm">
        <StoreReportForm storeSlug={safeSlug} mode={mode} productId={productId} />
      </div>
    </div>
  );
}
