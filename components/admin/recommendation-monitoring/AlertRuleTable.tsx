"use client";

import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import type { AlertMetricKey, AlertChannel, AlertSeverity } from "@/lib/types/recommendation-monitoring";
import {
  getRecommendationAlertRules,
  setAlertRuleActive,
} from "@/lib/recommendation-monitoring/mock-recommendation-alert-rules";
import { persistRecommendationOpsToServer } from "@/lib/recommendation-ops/recommendation-ops-sync-client";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

const METRIC_LABELS: Record<AlertMetricKey, string> = {
  success_rate: "성공률",
  empty_feed_rate: "빈피드율",
  ctr: "CTR",
  conversion_rate: "전환율",
  fallback_active: "Fallback 활성",
  kill_switch_active: "킬스위치 활성",
};

const CHANNEL_LABELS: Record<AlertChannel, string> = {
  email: "이메일",
  slack: "Slack",
  sms: "SMS",
  dashboard_only: "대시보드만",
};

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  warning: "경고",
  critical: "위험",
};

const COMPARATOR_LABELS: Record<string, string> = {
  lt: "<",
  gt: ">",
  eq: "=",
};

export function AlertRuleTable() {
  const [refresh, setRefresh] = useState(0);
  const rules = useMemo(() => getRecommendationAlertRules(), [refresh]);

  const handleToggleActive = async (id: string, isActive: boolean) => {
    setAlertRuleActive(id, !isActive);
    const r = await persistRecommendationOpsToServer();
    if (!r.ok) console.warn("[recommendation-ops] 저장 실패:", r.error);
    setRefresh((x) => x + 1);
  };

  if (rules.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
        알림 규칙이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              지표
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              조건
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              심각도
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              채널
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              사용
            </th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr
              key={r.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {SURFACE_LABELS[r.surface]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {METRIC_LABELS[r.metricKey]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {COMPARATOR_LABELS[r.comparator]} {r.thresholdValue}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] ${
                    r.severity === "critical"
                      ? "bg-red-50 text-red-800"
                      : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {SEVERITY_LABELS[r.severity]}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {CHANNEL_LABELS[r.channel]}
              </td>
              <td className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => void handleToggleActive(r.id, r.isActive)}
                  className={`rounded border px-2 py-1 text-[13px] ${
                    r.isActive
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-sam-border bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {r.isActive ? "ON" : "OFF"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
