"use client";

import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import type { AutomationActionType } from "@/lib/types/recommendation-automation";
import { getRecommendationAutomationExecutions } from "@/lib/recommendation-automation/mock-recommendation-automation-executions";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

const ACTION_LABELS: Record<AutomationActionType, string> = {
  auto_fallback: "자동 Fallback",
  auto_kill_switch: "자동 킬스위치",
  auto_rollback: "자동 롤백",
  auto_recovery: "자동 복귀",
  send_escalation: "Escalation 발송",
};

export function AutomationExecutionTable() {
  const [refresh, setRefresh] = useState(0);
  const [surfaceFilter, setSurfaceFilter] = useState<RecommendationSurface | "">("");

  const executions = useMemo(
    () =>
      getRecommendationAutomationExecutions({
        surface: surfaceFilter || undefined,
        limit: 50,
      }),
    [refresh, surfaceFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={surfaceFilter}
          onChange={(e) =>
            setSurfaceFilter(
              e.target.value === "" ? "" : (e.target.value as RecommendationSurface)
            )
          }
          className="rounded border border-gray-200 px-3 py-2 text-[14px]"
        >
          <option value="">전체 surface</option>
          <option value="home">홈</option>
          <option value="search">검색</option>
          <option value="shop">상점</option>
        </select>
      </div>
      {executions.length === 0 ? (
        <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          자동 조치 실행 이력이 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
          <table className="w-full min-w-[640px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  일시
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  surface
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  조치
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  모드
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  결과
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  사유
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-700">
                  before → after
                </th>
              </tr>
            </thead>
            <tbody>
              {executions.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-gray-600">
                    {new Date(e.createdAt).toLocaleString("ko-KR", { hour12: false })}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {SURFACE_LABELS[e.surface]}
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">
                    {ACTION_LABELS[e.actionType]}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">
                    {e.executionMode === "dry_run" ? "Dry-run" : "Live"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[12px] ${
                        e.status === "success"
                          ? "bg-emerald-50 text-emerald-800"
                          : e.status === "failed"
                            ? "bg-red-50 text-red-800"
                            : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2.5 text-[13px] text-gray-600">
                    {e.reason}
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-gray-600">
                    {e.beforeState} → {e.afterState}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
