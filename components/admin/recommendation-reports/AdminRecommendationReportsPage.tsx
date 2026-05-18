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
        titleKey="admin_rec_report_page_title"
        descriptionKey="admin_rec_report_page_desc"
      />
      <div className="mb-4">
        <ReportPeriodSelector onGenerated={handleGenerated} />
      </div>
      <AdminCard titleKey="admin_rec_report_card_list">
        <RecommendationReportTable refresh={refresh} />
      </AdminCard>
    </>
  );
}
