"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getRecommendationHealthStatuses } from "@/lib/recommendation-monitoring/mock-recommendation-health-statuses";
import { getFeedVersionById } from "@/lib/recommendation-experiments/mock-feed-versions";
import { recHealthLabel, recSurfaceLabel } from "@/components/admin/recommendation-admin-i18n";

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
                        ? "bg-emerald-50 text-emerald-800"
                        : s.status === "warning"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-red-50 text-red-800"
                    }`}
                  >
                    {recHealthLabel(t, s.status)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-sam-fg">{(s.successRate * 100).toFixed(1)}%</td>
                <td className="px-3 py-2.5 text-sam-fg">{(s.emptyFeedRate * 100).toFixed(2)}%</td>
                <td className="px-3 py-2.5">
                  {s.fallbackActive ? (
                    <span className="sam-text-body-secondary text-amber-600">ON</span>
                  ) : (
                    <span className="sam-text-body-secondary text-sam-muted">OFF</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {s.killSwitchActive ? (
                    <span className="sam-text-body-secondary text-red-600">ON</span>
                  ) : (
                    <span className="sam-text-body-secondary text-sam-muted">OFF</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-sam-fg">{(s.avgCtr * 100).toFixed(2)}%</td>
                <td className="px-3 py-2.5 text-sam-fg">{version?.versionName ?? s.liveVersionId ?? "-"}</td>
                <td className="px-3 py-2.5 text-sam-muted">{s.latestDeploymentStatus ?? "-"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {new Date(s.lastCheckedAt).toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
