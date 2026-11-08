"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { UserBehaviorProfile } from "@/lib/types/personalized-feed";

interface UserBehaviorProfileTableProps {
  profiles: UserBehaviorProfile[];
}

export function UserBehaviorProfileTable({ profiles }: UserBehaviorProfileTableProps) {
  const { t } = useI18n();
  if (profiles.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_personalized_feed_profile_empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_personalized_feed_col_user")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_personalized_feed_col_preferred_region")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_personalized_feed_col_interest_categories")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_personalized_feed_col_recent_viewed")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_personalized_feed_col_favorite_chat")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_personalized_feed_col_updated")}
            </th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => (
            <tr
              key={p.userId}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">{p.userId}</td>
              <td className="max-w-[140px] truncate px-3 py-2.5 text-sam-fg">
                {[p.preferredRegion, p.preferredCity, p.preferredBarangay]
                  .filter(Boolean)
                  .join(" · ") || "-"}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {p.favoriteCategories.slice(0, 3).join(", ") || "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {t("admin_personalized_feed_recent_viewed_line", { count: p.recentViewedProductIds.length, categories: p.recentViewedCategories.slice(0, 2).join(", ") || "-" })}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {t("admin_personalized_feed_favorite_chat_line", { favorites: p.recentFavoritedProductIds.length, chats: p.recentChattedProductIds.length })}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(p.updatedAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
