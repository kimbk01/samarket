"use client";

import { useState } from "react";
import type { ReportPeriod } from "@/lib/recommendation-reports/recommendation-report-utils";
import {
  generateRecommendationReport,
  getDateRange,
} from "@/lib/recommendation-reports/recommendation-report-utils";
import type { ReportType, ReportSurface } from "@/lib/types/recommendation-report";

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: "오늘",
  yesterday: "어제",
  last_7_days: "최근 7일",
  last_30_days: "최근 30일",
};

export function ReportPeriodSelector({
  onGenerated,
}: {
  onGenerated?: (reportId: string) => void;
}) {
  const [period, setPeriod] = useState<ReportPeriod>("today");
  const [surface, setSurface] = useState<ReportSurface>("all");
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [generating, setGenerating] = useState(false);

  const handleGenerate = () => {
    setGenerating(true);
    const reportId = generateRecommendationReport(
      period,
      surface,
      reportType,
      "admin1"
    );
    setGenerating(false);
    onGenerated?.(reportId);
  };

  const range = getDateRange(period);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-[14px] font-medium text-gray-900">
        새 보고서 생성
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-[12px] text-gray-500">기간</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as ReportPeriod)}
            className="rounded border border-gray-200 px-3 py-2 text-[14px]"
          >
            {(Object.keys(PERIOD_LABELS) as ReportPeriod[]).map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-gray-500">surface</label>
          <select
            value={surface}
            onChange={(e) => setSurface(e.target.value as ReportSurface)}
            className="rounded border border-gray-200 px-3 py-2 text-[14px]"
          >
            <option value="all">전체</option>
            <option value="home">홈</option>
            <option value="search">검색</option>
            <option value="shop">상점</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-gray-500">유형</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportType)}
            className="rounded border border-gray-200 px-3 py-2 text-[14px]"
          >
            <option value="daily">일간</option>
            <option value="weekly">주간</option>
            <option value="custom">맞춤</option>
          </select>
        </div>
        <div className="text-[13px] text-gray-500">
          {range.dateFrom} ~ {range.dateTo}
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="rounded border border-signature bg-signature px-4 py-2 text-[14px] font-medium text-white disabled:opacity-50"
        >
          {generating ? "생성 중…" : "보고서 생성"}
        </button>
      </div>
      <p className="mt-2 text-[12px] text-gray-500">
        맞춤 기간(custom) 선택은 placeholder입니다.
      </p>
    </div>
  );
}
