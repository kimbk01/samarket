"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { getAllRecentViewedProducts } from "@/lib/recommendation/recommendation-recent-viewed-state";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

const SOURCE_LABEL_KEYS: Record<string, MessageKey> = {
  home: "admin_rec_surface_home",
  search: "admin_rec_surface_search_screen",
  chat: "admin_rec_source_chat",
  recommendation: "admin_rec_source_recommendation",
  shop: "admin_rec_surface_shop",
};

export function RecentViewedAdminTable() {
  const { t } = useI18n();
  const allRecords = useMemo(() => getAllRecentViewedProducts(200), []);

  if (allRecords.length === 0) {
    return (
      <AdminEmptyState ko message={t("admin_rec_no_recent_viewed")} />
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_recommendation_col_user")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_recommendation_col_product_id")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_recommendation_col_source")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_recommendation_col_section")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_recommendation_col_viewed_at")}
            </th>
          </tr>
        </thead>
        <tbody>
          {allRecords.map((r) => (
            <tr
              key={r.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 text-sam-fg">{r.userId}</td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">{r.productId}</td>
              <td className="px-3 py-2.5 text-sam-fg">
                {SOURCE_LABEL_KEYS[r.source] ? t(SOURCE_LABEL_KEYS[r.source]) : r.source}
              </td>
              <td className="px-3 py-2.5 text-sam-muted">{r.sectionKey ?? "-"}</td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {formatAdminManilaDateTime(r.viewedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
