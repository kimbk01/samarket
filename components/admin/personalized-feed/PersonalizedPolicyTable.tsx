"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import type { PersonalizedFeedPolicy } from "@/lib/types/personalized-feed";
import { PERSONALIZED_SECTION_LABELS } from "@/lib/personalized-feed/personalized-section-labels";

interface PersonalizedPolicyTableProps {
  policies: PersonalizedFeedPolicy[];
  onEdit?: (policy: PersonalizedFeedPolicy) => void;
}

export function PersonalizedPolicyTable({
  policies,
  onEdit,
}: PersonalizedPolicyTableProps) {
  const { t } = useI18n();
  if (policies.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_personalized_feed_policy_empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_personalized_feed_col_section")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_personalized_feed_col_max")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_personalized_feed_col_weight_summary")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_personalized_feed_col_status")}
            </th>
            {onEdit && (
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                {t("admin_personalized_feed_col_actions")}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr
              key={p.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {PERSONALIZED_SECTION_LABELS[p.sectionKey]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{p.maxItems}</td>
              <td className="max-w-[200px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {t("admin_personalized_feed_weight_line", { category: p.categoryAffinityWeight, recent: p.recentViewWeight, favorite: p.recentFavoriteWeight, chat: p.recentChatWeight })}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                    p.isActive
                      ? "bg-sam-success-soft text-sam-success"
                      : "bg-sam-border-soft text-sam-muted"
                  }`}
                >
                  {p.isActive ? t("admin_personalized_feed_active") : t("admin_personalized_feed_inactive")}
                </span>
              </td>
              {onEdit && (
                <td className="px-3 py-2.5">
                  <AdminActionButton variant="ghost" size="sm" onClick={() => onEdit(p)}>
                    {t("admin_personalized_feed_action_edit")}
                  </AdminActionButton>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
