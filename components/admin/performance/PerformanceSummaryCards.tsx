"use client";

import { useMemo } from "react";
import { getPerformanceMetricsSummary } from "@/lib/performance/mock-performance-metrics";

export function PerformanceSummaryCards() {
  const summary = useMemo(() => getPerformanceMetricsSummary(), []);

  const status =
    summary.avgLoadTime > 2000
      ? "critical"
      : summary.avgLoadTime > 1000
        ? "warning"
        : "healthy";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-1 sam-text-body-secondary font-medium ${
            status === "healthy"
              ? "bg-emerald-50 text-emerald-700"
              : status === "warning"
                ? "bg-amber-50 text-amber-700"
                : "bg-red-100 text-red-800"
          }`}
        >
          성능 상태: {status === "healthy" ? "양호" : status === "warning" ? "주의" : "위험"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">평균 로딩 시간</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.avgLoadTime} ms
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">평균 API 응답</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.avgApiTime} ms
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">평균 DB 쿼리</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.avgDbQueryTime} ms
          </p>
        </div>
      </div>
    </div>
  );
}
