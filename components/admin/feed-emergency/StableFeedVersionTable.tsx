"use client";

import { useMemo, useState } from "react";
import { getStableFeedVersions } from "@/lib/feed-emergency/feed-emergency-state";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function StableFeedVersionTable() {
  const { t, language } = useI18n();
  const [refresh] = useState(0);
  const stable = useMemo(() => getStableFeedVersions(), [refresh]);

  if (stable.length === 0) {
    return (
      <AdminEmptyState ko={language !== "en"} message={t("admin_feed_emergency_priority_empty")} />
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">surface</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_feed_emergency_stable_th_version_id")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_feed_emergency_stable_th_stability")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_feed_emergency_k965e97cf")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_feed_emergency_stable_th_avg_conversion")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_feed_emergency_stable_th_created")}</th>
          </tr>
        </thead>
        <tbody>
          {stable.map((s) => (
            <tr key={s.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5 font-medium text-sam-fg">{SURFACE_LABELS[s.surface]}</td>
              <td className="px-3 py-2.5 text-sam-fg">{s.versionId}</td>
              <td className="px-3 py-2.5 text-sam-fg">{(s.stabilityScore * 100).toFixed(1)}%</td>
              <td className="px-3 py-2.5 text-sam-fg">{(s.avgCtr * 100).toFixed(2)}%</td>
              <td className="px-3 py-2.5 text-sam-fg">{(s.avgConversionRate * 100).toFixed(2)}%</td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {formatAdminManilaDateTime(s.markedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
