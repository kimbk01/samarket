"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getExperimentMetrics } from "@/lib/recommendation-experiments/recommendation-experiment-metrics";
import { getRecommendationExperiments } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { getFeedVersionById } from "@/lib/recommendation-experiments/recommendation-experiments-state";

export function ExperimentComparisonTable() {
  const { t } = useI18n();
  const [experimentId, setExperimentId] = useState<string>("");

  const experiments = useMemo(() => getRecommendationExperiments(), []);

  const currentExp = experimentId
    ? experiments.find((e) => e.id === experimentId)
    : experiments[0];
  const effectiveId = currentExp?.id ?? "";
  const effectiveMetrics = effectiveId ? getExperimentMetrics(effectiveId) : [];

  if (experiments.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_rec_exp_empty_experiment_list")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sam-text-body font-medium text-sam-fg">
          {t("admin_rec_exp_label_experiment")}
        </label>
        <select
          value={experimentId || effectiveId}
          onChange={(e) => setExperimentId(e.target.value)}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {experiments.map((e) => (
            <option key={e.id} value={e.id}>
              {e.experimentName}
            </option>
          ))}
        </select>
      </div>
      {effectiveMetrics.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_rec_exp_empty_metrics")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[560px] border-collapse sam-text-body">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  {t("admin_rec_th_version")}
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-sam-fg">
                  {t("admin_rec_th_assigned")}
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-sam-fg">
                  {t("admin_rec_th_impressions")}
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-sam-fg">
                  {t("admin_rec_th_clicks")}
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-sam-fg">
                  {t("admin_rec_th_conversion")}
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-sam-fg">
                  {t("admin_rec_th_ctr")}
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-sam-fg">
                  {t("admin_rec_exp_metrics_conversion_rate")}
                </th>
                <th className="px-3 py-2.5 text-right font-medium text-sam-fg">
                  {t("admin_rec_th_avg_score")}
                </th>
              </tr>
            </thead>
            <tbody>
              {effectiveMetrics.map((m) => {
                const version = getFeedVersionById(m.versionId);
                return (
                  <tr
                    key={m.id}
                    className="border-b border-sam-border-soft hover:bg-sam-app"
                  >
                    <td className="px-3 py-2.5 font-medium text-sam-fg">
                      {version?.versionName ?? m.versionId}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sam-fg">
                      {m.assignedUsers}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sam-fg">
                      {m.impressionCount}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sam-fg">
                      {m.clickCount}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sam-fg">
                      {m.conversionCount}
                    </td>
                    <td className="px-3 py-2.5 text-right text-sam-fg">
                      {(m.ctr * 100).toFixed(2)}%
                    </td>
                    <td className="px-3 py-2.5 text-right text-sam-fg">
                      {(m.conversionRate * 100).toFixed(2)}%
                    </td>
                    <td className="px-3 py-2.5 text-right text-sam-fg">
                      {m.avgScore}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
