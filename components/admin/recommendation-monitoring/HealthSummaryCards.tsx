"use client";

import { useMemo } from "react";
import { getRecommendationMonitoringSummary } from "@/lib/recommendation-monitoring/mock-recommendation-monitoring-summary";

export function HealthSummaryCards() {
  const summary = useMemo(() => getRecommendationMonitoringSummary(), []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="text-[12px] text-sam-muted">정상</p>
        <p className="text-[20px] font-semibold text-emerald-600">
          {summary.totalHealthy}
        </p>
        <p className="text-[13px] text-sam-muted">surface</p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="text-[12px] text-sam-muted">경고</p>
        <p className="text-[20px] font-semibold text-amber-600">
          {summary.totalWarning}
        </p>
        <p className="text-[13px] text-sam-muted">surface</p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="text-[12px] text-sam-muted">위험</p>
        <p className="text-[20px] font-semibold text-red-600">
          {summary.totalCritical}
        </p>
        <p className="text-[13px] text-sam-muted">surface</p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="text-[12px] text-sam-muted">미해결 이슈 / 미확인 알림</p>
        <p className="text-[20px] font-semibold text-sam-fg">
          {summary.openIncidentCount} / {summary.activeAlertCount}
        </p>
        <p className="text-[13px] text-sam-muted">
          Fallback {summary.fallbackSurfaceCount} · 킬스위치 {summary.killSwitchSurfaceCount}
        </p>
      </div>
    </div>
  );
}
