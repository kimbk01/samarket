"use client";

import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import {
  getRecommendationAutomationPolicies,
  saveRecommendationAutomationPolicy,
} from "@/lib/recommendation-automation/mock-recommendation-automation-policies";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

const FALLBACK_MODE_LABELS: Record<string, string> = {
  previous_live_version: "이전 live",
  safe_default_feed: "안전 기본",
  local_latest_only: "지역 최신만",
  static_slots_only: "정적 슬롯",
};

export function AutomationPolicyTable() {
  const [refresh, setRefresh] = useState(0);
  const policies = useMemo(
    () => getRecommendationAutomationPolicies(),
    [refresh]
  );

  const handleToggle = (
    id: string,
    surface: RecommendationSurface,
    field: keyof typeof policies[0],
    value: boolean
  ) => {
    const p = policies.find((x) => x.id === id);
    if (!p) return;
    saveRecommendationAutomationPolicy({ ...p, [field]: value });
    setRefresh((r) => r + 1);
  };

  if (policies.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        자동화 정책이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[800px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              사용
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              자동 Fallback
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              자동 킬스위치
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              자동 롤백
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              자동 복귀
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              Dry-run
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              Fallback 모드
            </th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr
              key={p.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {SURFACE_LABELS[p.surface]}
              </td>
              <td className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => handleToggle(p.id, p.surface, "isActive", !p.isActive)}
                  className={`rounded border px-2 py-1 text-[13px] ${
                    p.isActive
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-gray-200 bg-gray-100 text-gray-600"
                  }`}
                >
                  {p.isActive ? "ON" : "OFF"}
                </button>
              </td>
              <td className="px-3 py-2.5">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={p.autoFallbackEnabled}
                    onChange={(e) => {
                      saveRecommendationAutomationPolicy({
                        ...p,
                        autoFallbackEnabled: e.target.checked,
                      });
                      setRefresh((r) => r + 1);
                    }}
                    className="rounded border-gray-300"
                  />
                </label>
              </td>
              <td className="px-3 py-2.5">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={p.autoKillSwitchEnabled}
                    onChange={(e) => {
                      saveRecommendationAutomationPolicy({
                        ...p,
                        autoKillSwitchEnabled: e.target.checked,
                      });
                      setRefresh((r) => r + 1);
                    }}
                    className="rounded border-gray-300"
                  />
                </label>
              </td>
              <td className="px-3 py-2.5">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={p.autoRollbackEnabled}
                    onChange={(e) => {
                      saveRecommendationAutomationPolicy({
                        ...p,
                        autoRollbackEnabled: e.target.checked,
                      });
                      setRefresh((r) => r + 1);
                    }}
                    className="rounded border-gray-300"
                  />
                </label>
              </td>
              <td className="px-3 py-2.5">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={p.autoRecoveryEnabled}
                    onChange={(e) => {
                      saveRecommendationAutomationPolicy({
                        ...p,
                        autoRecoveryEnabled: e.target.checked,
                      });
                      setRefresh((r) => r + 1);
                    }}
                    className="rounded border-gray-300"
                  />
                </label>
              </td>
              <td className="px-3 py-2.5">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={p.dryRunEnabled}
                    onChange={(e) => {
                      saveRecommendationAutomationPolicy({
                        ...p,
                        dryRunEnabled: e.target.checked,
                      });
                      setRefresh((r) => r + 1);
                    }}
                    className="rounded border-gray-300"
                  />
                </label>
              </td>
              <td className="px-3 py-2.5 text-[13px] text-gray-700">
                {FALLBACK_MODE_LABELS[p.fallbackMode] ?? p.fallbackMode}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
