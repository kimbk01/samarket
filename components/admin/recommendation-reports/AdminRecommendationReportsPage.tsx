"use client";

import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { ReportPeriodSelector } from "./ReportPeriodSelector";
import { RecommendationReportTable } from "./RecommendationReportTable";

export function AdminRecommendationReportsPage() {
  const [refresh, setRefresh] = useState(0);

  const handleGenerated = () => {
    setRefresh((r) => r + 1);
  };

  return (
    <>
      <AdminPageHeader
        title="추천 운영 보고서"
        description="일간·주간 성과 리포트, KPI, 브리핑 보드"
      />
      <div className="mb-4">
        <ReportPeriodSelector onGenerated={handleGenerated} />
      </div>
      <AdminCard title="보고서 목록">
        <RecommendationReportTable refresh={refresh} />
      </AdminCard>
    </>
  );
}
