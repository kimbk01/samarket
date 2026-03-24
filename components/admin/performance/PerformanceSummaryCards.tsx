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
          className={`rounded px-2 py-1 text-[13px] font-medium ${
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
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">평균 로딩 시간</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {summary.avgLoadTime} ms
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">평균 API 응답</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {summary.avgApiTime} ms
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">평균 DB 쿼리</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {summary.avgDbQueryTime} ms
          </p>
        </div>
      </div>
    </div>
  );
}
