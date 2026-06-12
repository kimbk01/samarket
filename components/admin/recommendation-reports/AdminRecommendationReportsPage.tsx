"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { ReportPeriodSelector } from "./ReportPeriodSelector";
import { RecommendationReportTable } from "./RecommendationReportTable";
import { loadRecommendationAnalyticsFromServer } from "@/lib/recommendation-analytics/recommendation-analytics-sync-client";

export function AdminRecommendationReportsPage() {
  const { t } = useI18n();
  const [refresh, setRefresh] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadRecommendationAnalyticsFromServer().then(() => setHydrated(true));
  }, []);

  const handleGenerated = () => {
    setRefresh((r) => r + 1);
  };

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_rec_report_page_title" descriptionKey="admin_rec_report_page_desc" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">{t("admin_rec_mon_loading_settings")}</p>
        </AdminCard>
      </>
    );
  }

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
