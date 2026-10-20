"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { RecommendationExperiment } from "@/lib/types/recommendation-experiment";
import {
  recExperimentStatusLabel,
  recSurfaceLabel,
  recTrafficAllocLabel,
} from "@/components/admin/recommendation-admin-i18n";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

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
                      ? "bg-sam-success-soft text-sam-success"
                      : e.status === "draft"
                        ? "bg-sam-border-soft text-sam-muted"
                        : e.status === "paused"
                          ? "bg-sam-warning-soft text-sam-warning"
                          : "bg-sam-surface-muted text-sam-fg"
                  }`}
                >
                  {recExperimentStatusLabel(t, e.status)}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {onEdit && (
                    <AdminActionButton
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => onEdit(e)}
                    >
                      {t("common_edit")}
                    </AdminActionButton>
                  )}
                  {onStatusChange && e.status === "draft" && (
                    <AdminActionButton
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => onStatusChange(e, "running")}
                    >
                      {t("admin_rec_exp_btn_start")}
                    </AdminActionButton>
                  )}
                  {onStatusChange && e.status === "running" && (
                    <>
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => onStatusChange(e, "paused")}
                      >
                        {t("admin_rec_exp_btn_pause")}
                      </AdminActionButton>
                      <AdminActionButton
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => onStatusChange(e, "ended")}
                      >
                        {t("admin_rec_exp_btn_end")}
                      </AdminActionButton>
                    </>
                  )}
                  {onStatusChange && e.status === "paused" && (
                    <AdminActionButton
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => onStatusChange(e, "running")}
                    >
                      {t("admin_rec_exp_btn_resume")}
                    </AdminActionButton>
                  )}
                  {onChooseWinner && e.status === "ended" && (
                    <AdminActionButton
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => onChooseWinner(e)}
                    >
                      {t("admin_rec_exp_btn_choose_winner")}
                    </AdminActionButton>
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
