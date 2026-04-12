"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ReportType, ReportSurface } from "@/lib/types/recommendation-report";
import { getRecommendationReports } from "@/lib/recommendation-reports/mock-recommendation-reports";

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  daily: "일간",
  weekly: "주간",
  custom: "맞춤",
};

const SURFACE_LABELS: Record<ReportSurface, string> = {
  all: "전체",
  home: "홈",
  search: "검색",
  shop: "상점",
};

interface RecommendationReportTableProps {
  refresh?: number;
}

export function RecommendationReportTable({ refresh = 0 }: RecommendationReportTableProps) {
  const [typeFilter, setTypeFilter] = useState<ReportType | "">("");
  const reports = useMemo(
    () =>
      getRecommendationReports({
        reportType: typeFilter || undefined,
        limit: 30,
      }),
    [refresh, typeFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(e.target.value === "" ? "" : (e.target.value as ReportType))
          }
          className="rounded border border-sam-border px-3 py-2 text-[14px]"
        >
          <option value="">전체 유형</option>
          <option value="daily">일간</option>
          <option value="weekly">주간</option>
          <option value="custom">맞춤</option>
        </select>
      </div>
      {reports.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
          보고서가 없습니다. 기간을 선택한 뒤 생성 버튼을 눌러 주세요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
          <table className="w-full min-w-[560px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-sam-border bg-sam-app">
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  제목
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  유형
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  surface
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  기간
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
                  생성
                </th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-sam-border-soft hover:bg-sam-app"
                >
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/recommendation-reports/${r.id}`}
                      className="font-medium text-signature hover:underline"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {REPORT_TYPE_LABELS[r.reportType]}
                  </td>
                  <td className="px-3 py-2.5 text-sam-fg">
                    {SURFACE_LABELS[r.surface]}
                  </td>
                  <td className="px-3 py-2.5 text-sam-muted">
                    {r.dateFrom} ~ {r.dateTo}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-sam-muted">
                    {new Date(r.generatedAt).toLocaleString("ko-KR", { hour12: false })}
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
