"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getExperimentMetrics } from "@/lib/recommendation-experiments/recommendation-experiment-metrics";
import { getRecommendationExperiments } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { getFeedVersionById } from "@/lib/recommendation-experiments/recommendation-experiments-state";

export function ExperimentMetricsCards() {
  const { t } = useI18n();
  const [experimentId, setExperimentId] = useState<string>("");

  const experiments = useMemo(() => getRecommendationExperiments(), []);
  const effectiveId = experimentId || experiments[0]?.id || "";
  const effectiveMetrics = useMemo(
    () => (effectiveId ? getExperimentMetrics(effectiveId) : []),
    [effectiveId]
  );

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
          value={effectiveId}
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {effectiveMetrics.map((m) => {
            const version = getFeedVersionById(m.versionId);
            return (
              <div
                key={m.id}
                className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
              >
                <p className="sam-text-body font-medium text-sam-fg">
                  {version?.versionName ?? m.versionId}
                </p>
                <dl className="mt-2 space-y-1 sam-text-body-secondary text-sam-fg">
                  <div className="flex justify-between">
                    <dt>{t("admin_rec_exp_metrics_assigned_users")}</dt>
                    <dd>{m.assignedUsers}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t("admin_rec_exp_metrics_impressions")}</dt>
                    <dd>{m.impressionCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t("admin_rec_exp_metrics_clicks")}</dt>
                    <dd>{m.clickCount}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t("admin_rec_exp_metrics_conversions")}</dt>
                    <dd>{m.conversionCount}</dd>
                  </div>
                  <div className="flex justify-between font-medium">
                    <dt>{t("admin_rec_th_ctr")}</dt>
                    <dd>{(m.ctr * 100).toFixed(2)}%</dd>
                  </div>
                  <div className="flex justify-between font-medium">
                    <dt>{t("admin_rec_exp_metrics_conversion_rate")}</dt>
                    <dd>{(m.conversionRate * 100).toFixed(2)}%</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{t("admin_rec_exp_metrics_avg_score")}</dt>
                    <dd>{m.avgScore}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
