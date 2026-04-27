"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdProduct } from "@/lib/ads/types";
import { AdProductTable } from "@/components/admin/ad-products/AdProductTable";

export function AdminAdProductsPageClient({ products }: { products: AdProduct[] }) {
  const { t: tr } = useI18n();
  const stats = [
    { labelKey: "admin_ad_products_stat_total" as const, value: products.length },
    { labelKey: "admin_ad_products_stat_active" as const, value: products.filter((p) => p.isActive).length },
    { labelKey: "admin_ad_products_stat_inactive" as const, value: products.filter((p) => !p.isActive).length },
  ];
  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="sam-text-hero font-bold text-sam-fg">{tr("admin_ad_products_title")}</h1>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">{tr("admin_ad_products_desc")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(({ labelKey, value }) => (
          <div
            key={labelKey}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-center shadow-sm"
          >
            <p className="sam-text-hero font-bold text-sam-fg">{value}</p>
            <p className="sam-text-helper text-sam-muted">{tr(labelKey)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-sam-border px-4 py-3">
          <h2 className="sam-text-body font-semibold text-sam-fg">{tr("admin_ad_products_list_heading")}</h2>
        </div>
        <div className="p-4">
          <AdProductTable products={products} />
        </div>
      </div>
    </div>
  );
}
