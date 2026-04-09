"use client";

import { useMemo } from "react";
import { getRecommendationMonitoringSummary } from "@/lib/recommendation-monitoring/mock-recommendation-monitoring-summary";

export function HealthSummaryCards() {
  const summary = useMemo(() => getRecommendationMonitoringSummary(), []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">정상</p>
        <p className="text-[20px] font-semibold text-emerald-600">
          {summary.totalHealthy}
        </p>
        <p className="text-[13px] text-gray-600">surface</p>
      </div>
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">경고</p>
        <p className="text-[20px] font-semibold text-amber-600">
          {summary.totalWarning}
        </p>
        <p className="text-[13px] text-gray-600">surface</p>
      </div>
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">위험</p>
        <p className="text-[20px] font-semibold text-red-600">
          {summary.totalCritical}
        </p>
        <p className="text-[13px] text-gray-600">surface</p>
      </div>
      <div className="rounded-ui-rect border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">미해결 이슈 / 미확인 알림</p>
        <p className="text-[20px] font-semibold text-gray-900">
          {summary.openIncidentCount} / {summary.activeAlertCount}
        </p>
        <p className="text-[13px] text-gray-600">
          Fallback {summary.fallbackSurfaceCount} · 킬스위치 {summary.killSwitchSurfaceCount}
        </p>
      </div>
    </div>
  );
}
