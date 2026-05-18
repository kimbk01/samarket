"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { RecommendationExperiment } from "@/lib/types/recommendation-experiment";
import {
  recExperimentStatusLabel,
  recSurfaceLabel,
  recTrafficAllocLabel,
} from "@/components/admin/recommendation-admin-i18n";

interface ExperimentTableProps {
  experiments: RecommendationExperiment[];
  onEdit?: (exp: RecommendationExperiment) => void;
  onStatusChange?: (exp: RecommendationExperiment, status: RecommendationExperiment["status"]) => void;
  onChooseWinner?: (exp: RecommendationExperiment) => void;
}

export function ExperimentTable({
  experiments,
  onEdit,
  onStatusChange,
  onChooseWinner,
}: ExperimentTableProps) {
  const { t } = useI18n();

  if (experiments.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_rec_exp_empty_experiments")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[720px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_exp_label_experiment_name")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_surface")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_control_variant_ratio")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_status")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_work")}
            </th>
          </tr>
        </thead>
        <tbody>
          {experiments.map((e) => (
            <tr
              key={e.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5">
                <span className="font-medium text-sam-fg">{e.experimentName}</span>
                {e.description && (
                  <p className="sam-text-helper text-sam-muted">{e.description}</p>
                )}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {recSurfaceLabel(t, e.targetSurface)}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {t("admin_rec_exp_ratio_line", {
                  alloc: recTrafficAllocLabel(t, e.trafficAllocationType),
                  control: e.controlPercentage,
                  variants: e.variantPercentages.join(","),
                })}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                    e.status === "running"
                      ? "bg-emerald-50 text-emerald-800"
                      : e.status === "draft"
                        ? "bg-sam-border-soft text-sam-muted"
                        : e.status === "paused"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-sam-surface-muted text-sam-fg"
                  }`}
                >
                  {recExperimentStatusLabel(t, e.status)}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(e)}
                      className="sam-text-body-secondary text-signature hover:underline"
                    >
                      {t("common_edit")}
                    </button>
                  )}
                  {onStatusChange && e.status === "draft" && (
                    <button
                      type="button"
                      onClick={() => onStatusChange(e, "running")}
                      className="sam-text-body-secondary text-emerald-600 hover:underline"
                    >
                      {t("admin_rec_exp_btn_start")}
                    </button>
                  )}
                  {onStatusChange && e.status === "running" && (
                    <>
                      <button
                        type="button"
                        onClick={() => onStatusChange(e, "paused")}
                        className="sam-text-body-secondary text-amber-600 hover:underline"
                      >
                        {t("admin_rec_exp_btn_pause")}
                      </button>
                      <button
                        type="button"
                        onClick={() => onStatusChange(e, "ended")}
                        className="sam-text-body-secondary text-sam-muted hover:underline"
                      >
                        {t("admin_rec_exp_btn_end")}
                      </button>
                    </>
                  )}
                  {onStatusChange && e.status === "paused" && (
                    <button
                      type="button"
                      onClick={() => onStatusChange(e, "running")}
                      className="sam-text-body-secondary text-emerald-600 hover:underline"
                    >
                      {t("admin_rec_exp_btn_resume")}
                    </button>
                  )}
                  {onChooseWinner && e.status === "ended" && (
                    <button
                      type="button"
                      onClick={() => onChooseWinner(e)}
                      className="sam-text-body-secondary text-signature hover:underline"
                    >
                      {t("admin_rec_exp_btn_choose_winner")}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
