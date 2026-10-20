"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getRecommendationHealthStatuses } from "@/lib/recommendation-analytics/recommendation-health-status";
import { getFeedVersionById } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { recHealthLabel, recSurfaceLabel } from "@/components/admin/recommendation-admin-i18n";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

export function SurfaceHealthTable() {
  const { t } = useI18n();
  const [refresh, setRefresh] = useState(0);
  const statuses = useMemo(() => getRecommendationHealthStatuses(), [refresh]);

  if (statuses.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_rec_mon_empty_health")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[720px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_rec_th_surface")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_rec_th_status")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_rec_th_success_rate")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_rec_th_empty_feed_rate")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_rec_th_fallback")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_rec_th_kill_switch")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_rec_th_avg_ctr")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_rec_th_live_version")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_rec_th_deploy_status")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_rec_th_checked_at")}</th>
          </tr>
        </thead>
        <tbody>
          {statuses.map((s) => {
            const version = s.liveVersionId ? getFeedVersionById(s.liveVersionId) : null;
            return (
              <tr key={s.id} className="border-b border-sam-border-soft hover:bg-sam-app">
                <td className="px-3 py-2.5 font-medium text-sam-fg">{recSurfaceLabel(t, s.surface)}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                      s.status === "healthy"
                        ? "bg-sam-success-soft text-sam-success"
                        : s.status === "warning"
                          ? "bg-sam-warning-soft text-sam-warning"
                          : "bg-sam-danger-soft text-sam-danger"
                    }`}
                  >
                    {recHealthLabel(t, s.status)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-sam-fg">{(s.successRate * 100).toFixed(1)}%</td>
                <td className="px-3 py-2.5 text-sam-fg">{(s.emptyFeedRate * 100).toFixed(2)}%</td>
                <td className="px-3 py-2.5">
                  {s.fallbackActive ? (
                    <span className="sam-text-body-secondary text-sam-warning">ON</span>
                  ) : (
                    <span className="sam-text-body-secondary text-sam-muted">OFF</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {s.killSwitchActive ? (
                    <span className="sam-text-body-secondary text-sam-danger">ON</span>
                  ) : (
                    <span className="sam-text-body-secondary text-sam-muted">OFF</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-sam-fg">{(s.avgCtr * 100).toFixed(2)}%</td>
                <td className="px-3 py-2.5 text-sam-fg">{version?.versionName ?? s.liveVersionId ?? "-"}</td>
                <td className="px-3 py-2.5 text-sam-muted">{s.latestDeploymentStatus ?? "-"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {formatAdminManilaDateTime(s.lastCheckedAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
