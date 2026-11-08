"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo, useState } from "react";
import type { WinningMetric } from "@/lib/types/recommendation-deployment";
import { getRecommendationExperiments } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { getExperimentWinnerSummaries } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { chooseWinner } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { getFeedVersionById } from "@/lib/recommendation-experiments/recommendation-experiments-state";
import { ASSIGNED_GROUP_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";
import { commitRecommendationExperimentsChange } from "@/lib/recommendation-experiments/recommendation-experiments-sync-client";
import { AdminEmptyState, AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

const WINNING_METRIC_LABEL_KEYS: Record<WinningMetric, MessageKey> = {
  ctr: "admin_rec_deploy_metric_ctr_first",
  conversion_rate: "admin_rec_deploy_metric_conversion_first",
  composite_score: "admin_rec_deploy_metric_composite_first",
};

export function ExperimentWinnerTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [saveResult, setSaveResult] = useState<{ ok: false; code: string } | null>(null);
  const [metric, setMetric] = useState<WinningMetric>("ctr");
  const [choosingId, setChoosingId] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  const experiments = useMemo(
    () => getRecommendationExperiments().filter((e) => e.status === "ended"),
    [refresh]
  );
  const summaries = useMemo(
    () => getExperimentWinnerSummaries(),
    [refresh]
  );

  /** 저장 실패 → 승자 선택 되돌림 + 실패 문구 (예전: 실패 무시). */
  const handleChooseWinner = async (experimentId: string) => {
    setChoosingId(experimentId);
    const r = await commitRecommendationExperimentsChange(() => {
      chooseWinner(experimentId, metric);
    });
    setSaveResult(r.ok ? null : { ok: false, code: r.error ?? "save_failed" });
    setChoosingId(null);
    setRefresh((n) => n + 1);
  };

  if (experiments.length === 0 && summaries.length === 0) {
    return <AdminEmptyState ko={ko} message={t("admin_rec_deploy_no_winners")} />;
  }

  return (
    <div className="space-y-4">
      <AdminResultBanner ko={ko} result={saveResult} onClose={() => setSaveResult(null)} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="sam-text-body font-medium text-sam-fg">
          {t("admin_rec_deployments_winner_criteria")}
        </label>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as WinningMetric)}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {(Object.keys(WINNING_METRIC_LABEL_KEYS) as WinningMetric[]).map((m) => (
            <option key={m} value={m}>
              {t(WINNING_METRIC_LABEL_KEYS[m])}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
        <table className="w-full min-w-[560px] border-collapse sam-text-body">
          <thead>
            <tr className="border-b border-sam-border bg-sam-app">
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                {t("admin_rec_deployments_col_experiment")}
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                {t("admin_rec_deployments_col_winner_version")}
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                {t("admin_rec_deployments_col_group")}
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                {t("admin_rec_deployments_col_criteria_value")}
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                {t("admin_rec_deployments_col_deploy_reco")}
              </th>
              <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                {t("admin_rec_deployments_col_actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => {
              const exp = experiments.find((e) => e.id === s.experimentId);
              const version = getFeedVersionById(s.winningVersionId);
              return (
                <tr
                  key={s.experimentId}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="px-3 py-2.5 font-medium text-sam-fg">
                    {exp?.experimentName ?? s.experimentId}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {version?.versionName ?? s.winningVersionId}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {ASSIGNED_GROUP_LABELS[s.winningGroup]}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {t(WINNING_METRIC_LABEL_KEYS[s.winningMetric])} / {s.winningValue}
                  </td>
                  <td className="px-3 py-2.5">
                    {s.autoDeployRecommended ? (
                      <span className="sam-text-body-secondary text-sam-success">{t("admin_rec_deploy_k4b0ea2fc")}</span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-3 py-2.5">-</td>
                </tr>
              );
            })}
            {experiments
              .filter((e) => !summaries.some((s) => s.experimentId === e.id))
              .map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="px-3 py-2.5 font-medium text-sam-fg">
                    {e.experimentName}
                  </td>
                  <td className="px-3 py-2.5 text-sam-muted">-</td>
                  <td className="px-3 py-2.5 text-sam-muted">-</td>
                  <td className="px-3 py-2.5 text-sam-muted">-</td>
                  <td className="px-3 py-2.5 text-sam-muted">-</td>
                  <td className="px-3 py-2.5">
                    <AdminActionButton
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => void handleChooseWinner(e.id)}
                      disabled={!!choosingId}
                    >
                      {t("admin_rec_deployments_select_winner")}
                    </AdminActionButton>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
