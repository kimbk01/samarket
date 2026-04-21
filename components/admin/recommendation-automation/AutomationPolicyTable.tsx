"use client";

import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import {
  getRecommendationAutomationPolicies,
  saveRecommendationAutomationPolicy,
} from "@/lib/recommendation-automation/mock-recommendation-automation-policies";
import { persistRecommendationOpsToServer } from "@/lib/recommendation-ops/recommendation-ops-sync-client";
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

  const flush = async () => {
    const r = await persistRecommendationOpsToServer();
    if (!r.ok) console.warn("[recommendation-ops] 저장 실패:", r.error);
    setRefresh((x) => x + 1);
  };

  const handleToggle = async (
    id: string,
    _surface: RecommendationSurface,
    field: keyof (typeof policies)[0],
    value: boolean
  ) => {
    const p = policies.find((x) => x.id === id);
    if (!p) return;
    saveRecommendationAutomationPolicy({ ...p, [field]: value });
    await flush();
  };

  if (policies.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        자동화 정책이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[800px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              사용
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              자동 Fallback
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              자동 킬스위치
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              자동 롤백
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              자동 복귀
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              Dry-run
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              Fallback 모드
            </th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr
              key={p.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {SURFACE_LABELS[p.surface]}
              </td>
              <td className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => void handleToggle(p.id, p.surface, "isActive", !p.isActive)}
                  className={`rounded border px-2 py-1 sam-text-body-secondary ${
                    p.isActive
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-sam-border bg-sam-surface-muted text-sam-muted"
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
                      void flush();
                    }}
                    className="rounded border-sam-border"
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
                      void flush();
                    }}
                    className="rounded border-sam-border"
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
                      void flush();
                    }}
                    className="rounded border-sam-border"
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
                      void flush();
                    }}
                    className="rounded border-sam-border"
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
                      void flush();
                    }}
                    className="rounded border-sam-border"
                  />
                </label>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {FALLBACK_MODE_LABELS[p.fallbackMode] ?? p.fallbackMode}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
