"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { HomeFeedPolicy } from "@/lib/types/home-feed";
import {
  SECTION_LABELS,
  SORT_MODE_LABELS,
  REGION_SCOPE_LABELS,
} from "@/lib/home-feed/home-feed-labels";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

interface HomeFeedPolicyTableProps {
  policies: HomeFeedPolicy[];
  onEdit?: (policy: HomeFeedPolicy) => void;
}

export function HomeFeedPolicyTable({
  policies,
  onEdit,
}: HomeFeedPolicyTableProps) {
  const { t } = useI18n();
  if (policies.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_home_feed_policy_empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[720px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_home_feed_policy_col_section")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_home_feed_policy_col_sort")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_home_feed_policy_col_max")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_home_feed_policy_col_region_scope")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_home_feed_policy_col_status")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_home_feed_policy_col_order")}
            </th>
            {onEdit && (
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                {t("admin_home_feed_policy_col_actions")}
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
                {SECTION_LABELS[p.sectionKey]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {SORT_MODE_LABELS[p.sortMode]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{p.maxItems}</td>
              <td className="px-3 py-2.5 text-sam-fg">
                {REGION_SCOPE_LABELS[p.regionScope]}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                    p.isActive
                      ? "bg-sam-success-soft text-sam-success"
                      : "bg-sam-border-soft text-sam-muted"
                  }`}
                >
                  {p.isActive ? t("admin_home_feed_active") : t("admin_home_feed_inactive")}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{p.priorityOrder}</td>
              {onEdit && (
                <td className="px-3 py-2.5">
                  <AdminActionButton
                    onClick={() => onEdit(p)}
                    variant="ghost"
                    size="sm"
                  >
                    {t("admin_home_feed_policy_edit")}
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
