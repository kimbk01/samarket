"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { ReportPeriodSelector } from "./ReportPeriodSelector";
import { RecommendationReportTable } from "./RecommendationReportTable";
import { loadRecommendationAnalyticsWithRecordsSummary } from "@/lib/recommendation-ops/recommendation-records-client";

export function AdminRecommendationReportsPage() {
  const [refresh, setRefresh] = useState(0);
  const { state: loadState, reload } = useAdminSyncLoad(loadRecommendationAnalyticsWithRecordsSummary);
  const hydrated = loadState.status === "ready";

  const handleGenerated = () => {
    setRefresh((r) => r + 1);
  };

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_manage_reports" descriptionKey="admin_rec_report_page_desc" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        titleKey="admin_menu_manage_reports"
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
