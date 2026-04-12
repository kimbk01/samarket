"use client";

import type { RecommendationExperiment } from "@/lib/types/recommendation-experiment";
import {
  EXPERIMENT_STATUS_LABELS,
  TRAFFIC_ALLOCATION_LABELS,
} from "@/lib/recommendation-experiments/mock-recommendation-experiments";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

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
  if (experiments.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
        등록된 실험이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[720px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              실험명
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              대조/실험 비율
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              상태
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              작업
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
                  <p className="text-[12px] text-sam-muted">{e.description}</p>
                )}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {SURFACE_LABELS[e.targetSurface]}
              </td>
              <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                {TRAFFIC_ALLOCATION_LABELS[e.trafficAllocationType]} · 대조 {e.controlPercentage}% / 실험 {e.variantPercentages.join(",")}%
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] font-medium ${
                    e.status === "running"
                      ? "bg-emerald-50 text-emerald-800"
                      : e.status === "draft"
                        ? "bg-sam-border-soft text-sam-muted"
                        : e.status === "paused"
                          ? "bg-amber-50 text-amber-800"
                          : "bg-sam-surface-muted text-sam-fg"
                  }`}
                >
                  {EXPERIMENT_STATUS_LABELS[e.status]}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(e)}
                      className="text-[13px] text-signature hover:underline"
                    >
                      편집
                    </button>
                  )}
                  {onStatusChange && e.status === "draft" && (
                    <button
                      type="button"
                      onClick={() => onStatusChange(e, "running")}
                      className="text-[13px] text-emerald-600 hover:underline"
                    >
                      시작
                    </button>
                  )}
                  {onStatusChange && e.status === "running" && (
                    <>
                      <button
                        type="button"
                        onClick={() => onStatusChange(e, "paused")}
                        className="text-[13px] text-amber-600 hover:underline"
                      >
                        일시중지
                      </button>
                      <button
                        type="button"
                        onClick={() => onStatusChange(e, "ended")}
                        className="text-[13px] text-sam-muted hover:underline"
                      >
                        종료
                      </button>
                    </>
                  )}
                  {onStatusChange && e.status === "paused" && (
                    <button
                      type="button"
                      onClick={() => onStatusChange(e, "running")}
                      className="text-[13px] text-emerald-600 hover:underline"
                    >
                      재개
                    </button>
                  )}
                  {onChooseWinner && e.status === "ended" && (
                    <button
                      type="button"
                      onClick={() => onChooseWinner(e)}
                      className="text-[13px] text-signature hover:underline"
                    >
                      승자 선택
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
