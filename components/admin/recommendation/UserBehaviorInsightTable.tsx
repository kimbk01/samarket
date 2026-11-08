"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { UserBehaviorInsight } from "@/lib/types/recommendation";
import { getUserBehaviorInsights } from "@/lib/recommendation/recommendation-behavior-insight";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

export function UserBehaviorInsightTable() {
  const { t } = useI18n();
  const insights = getUserBehaviorInsights();

  if (insights.length === 0) {
    return (
      <AdminEmptyState ko message={t("admin_rec_no_behavior_insights")} />
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_recommendation_col_user")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_recommendation_col_preferred_category")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_recommendation_col_preferred_region")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_recommendation_col_view_favorite_chat")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_recommendation_col_recent_activity")}
            </th>
          </tr>
        </thead>
        <tbody>
          {insights.map((i) => (
            <tr
              key={i.userId}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">{i.userId}</td>
              <td className="max-w-[160px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {i.topCategories.slice(0, 3).join(", ") || "-"}
              </td>
              <td className="max-w-[140px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {i.topRegions.slice(0, 2).join(", ") || "-"}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {t("admin_recommendation_view_favorite_chat_line", { views: i.totalViews, favorites: i.totalFavorites, chats: i.totalChatsStarted })}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {formatAdminManilaDateTime(i.lastActiveAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
