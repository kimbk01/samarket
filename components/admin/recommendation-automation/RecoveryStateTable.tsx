"use client";

import { useMemo, useState } from "react";
import { getRecommendationRecoveryStates } from "@/lib/recommendation-automation/mock-recommendation-recovery-states";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";
import type { RecommendationSurface } from "@/lib/types/recommendation";

const MODE_LABELS: Record<string, string> = {
  normal: "정상",
  fallback: "Fallback",
  kill_switch: "킬스위치",
};

export function RecoveryStateTable() {
  const [refresh, setRefresh] = useState(0);
  const states = useMemo(
    () => getRecommendationRecoveryStates(),
    [refresh]
  );

  if (states.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        복귀 상태가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[480px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              현재 모드
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              복귀 가능
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              사유
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              확인 시각
            </th>
          </tr>
        </thead>
        <tbody>
          {states.map((s) => (
            <tr
              key={s.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {SURFACE_LABELS[s.surface]}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper ${
                    s.currentMode === "normal"
                      ? "bg-emerald-50 text-emerald-800"
                      : s.currentMode === "fallback"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-red-50 text-red-800"
                  }`}
                >
                  {MODE_LABELS[s.currentMode]}
                </span>
              </td>
              <td className="px-3 py-2.5">
                {s.recoveryEligible ? (
                  <span className="sam-text-body-secondary text-emerald-600">가능</span>
                ) : (
                  <span className="sam-text-body-secondary text-sam-muted">-</span>
                )}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {s.recoveryReason || "-"}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(s.checkedAt).toLocaleString("ko-KR", { hour12: false })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
