"use client";

import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import type { AlertMetricKey, AlertChannel, AlertSeverity } from "@/lib/types/recommendation-monitoring";
import {
  getRecommendationAlertRules,
  saveRecommendationAlertRule,
  setAlertRuleActive,
} from "@/lib/recommendation-monitoring/mock-recommendation-alert-rules";
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

  const handleToggleActive = (id: string, isActive: boolean) => {
    setAlertRuleActive(id, !isActive);
    setRefresh((r) => r + 1);
  };

  if (rules.length === 0) {
    return (
      <div className="rounded-ui-rect border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        알림 규칙이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              지표
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              조건
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              심각도
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              채널
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">
              사용
            </th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr
              key={r.id}
              className="border-b border-gray-100 hover:bg-gray-50"
            >
              <td className="px-3 py-2.5 font-medium text-gray-900">
                {SURFACE_LABELS[r.surface]}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {METRIC_LABELS[r.metricKey]}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
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
              <td className="px-3 py-2.5 text-gray-700">
                {CHANNEL_LABELS[r.channel]}
              </td>
              <td className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => handleToggleActive(r.id, r.isActive)}
                  className={`rounded border px-2 py-1 text-[13px] ${
                    r.isActive
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-gray-200 bg-gray-100 text-gray-600"
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
