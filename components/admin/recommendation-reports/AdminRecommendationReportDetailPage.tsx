"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getRecommendationReportById } from "@/lib/recommendation-reports/mock-recommendation-reports";
import { RecommendationReportKpiCards } from "./RecommendationReportKpiCards";
import { RecommendationSectionReportTable } from "./RecommendationSectionReportTable";
import { RecommendationVersionReportTable } from "./RecommendationVersionReportTable";
import { RecommendationReasonAnalyticsTable } from "./RecommendationReasonAnalyticsTable";
import { RecommendationCategoryAnalyticsTable } from "./RecommendationCategoryAnalyticsTable";
import { RecommendationRegionAnalyticsTable } from "./RecommendationRegionAnalyticsTable";
import { RecommendationBriefingBoardCard } from "./RecommendationBriefingBoardCard";

type TabId = "kpi" | "sections" | "versions" | "analytics" | "briefing";

const TABS: { id: TabId; label: string }[] = [
  { id: "kpi", label: "KPI 요약" },
  { id: "sections", label: "섹션 성과" },
  { id: "versions", label: "버전 성과" },
  { id: "analytics", label: "이유/카테고리/지역" },
  { id: "briefing", label: "브리핑 보드" },
];

interface AdminRecommendationReportDetailPageProps {
  reportId: string;
}

export function AdminRecommendationReportDetailPage({
  reportId,
}: AdminRecommendationReportDetailPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>("kpi");

  const report = useMemo(
    () => getRecommendationReportById(reportId),
    [reportId]
  );

  if (!report) {
    return (
      <>
        <AdminPageHeader title="보고서 없음" />
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          해당 보고서를 찾을 수 없습니다.
          <Link href="/admin/recommendation-reports" className="ml-2 text-signature hover:underline">
            목록으로
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        backHref="/admin/recommendation-reports"
        title={report.title}
        description={`${report.dateFrom} ~ ${report.dateTo} · ${report.surface}`}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded border border-gray-200 bg-gray-100 px-3 py-2 text-[14px] text-gray-600"
        >
          다운로드 (CSV/PDF placeholder)
        </button>
      </div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 text-[14px] font-medium ${
              activeTab === tab.id
                ? "border-signature text-signature"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "kpi" && (
        <div className="mb-4">
          <RecommendationReportKpiCards reportId={reportId} />
        </div>
      )}
      {activeTab === "sections" && (
        <AdminCard title="섹션별 성과">
          <RecommendationSectionReportTable reportId={reportId} />
        </AdminCard>
      )}
      {activeTab === "versions" && (
        <AdminCard title="버전별 성과">
          <RecommendationVersionReportTable reportId={reportId} />
        </AdminCard>
      )}
      {activeTab === "analytics" && (
        <div className="space-y-4">
          <AdminCard title="추천 이유 Top N">
            <RecommendationReasonAnalyticsTable reportId={reportId} />
          </AdminCard>
          <AdminCard title="카테고리별 성과">
            <RecommendationCategoryAnalyticsTable reportId={reportId} />
          </AdminCard>
          <AdminCard title="지역별 성과">
            <RecommendationRegionAnalyticsTable reportId={reportId} />
          </AdminCard>
        </div>
      )}
      {activeTab === "briefing" && (
        <AdminCard title="브리핑 보드">
          <RecommendationBriefingBoardCard reportId={reportId} />
        </AdminCard>
      )}
    </>
  );
}
