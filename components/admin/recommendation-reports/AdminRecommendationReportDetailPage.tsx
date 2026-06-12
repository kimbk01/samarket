"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getRecommendationReportById } from "@/lib/recommendation-analytics/recommendation-analytics-state";
import { RecommendationReportKpiCards } from "./RecommendationReportKpiCards";
import { RecommendationSectionReportTable } from "./RecommendationSectionReportTable";
import { RecommendationVersionReportTable } from "./RecommendationVersionReportTable";
import { RecommendationReasonAnalyticsTable } from "./RecommendationReasonAnalyticsTable";
import { RecommendationCategoryAnalyticsTable } from "./RecommendationCategoryAnalyticsTable";
import { RecommendationRegionAnalyticsTable } from "./RecommendationRegionAnalyticsTable";
import { RecommendationBriefingBoardCard } from "./RecommendationBriefingBoardCard";

type TabId = "kpi" | "sections" | "versions" | "analytics" | "briefing";

const REPORT_TABS: { id: TabId; labelKey: MessageKey }[] = [
  { id: "kpi", labelKey: "admin_rec_report_tab_kpi" },
  { id: "sections", labelKey: "admin_rec_report_tab_sections" },
  { id: "versions", labelKey: "admin_rec_report_tab_versions" },
  { id: "analytics", labelKey: "admin_rec_report_tab_analytics" },
  { id: "briefing", labelKey: "admin_rec_report_tab_briefing" },
];

interface AdminRecommendationReportDetailPageProps {
  reportId: string;
}

export function AdminRecommendationReportDetailPage({
  reportId,
}: AdminRecommendationReportDetailPageProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("kpi");

  const report = useMemo(
    () => getRecommendationReportById(reportId),
    [reportId]
  );

  if (!report) {
    return (
      <>
        <AdminPageHeader titleKey="admin_rec_report_not_found_title" />
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_rec_report_not_found_body")}
          <Link href="/admin/recommendation-reports" className="ml-2 text-signature hover:underline">
            {t("admin_back_to_list")}
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
          className="rounded border border-sam-border bg-sam-surface-muted px-3 py-2 sam-text-body text-sam-muted"
        >
          {t("admin_rec_report_download_placeholder")}
        </button>
      </div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {REPORT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 sam-text-body font-medium ${
              activeTab === tab.id
                ? "border-signature text-signature"
                : "border-transparent text-sam-muted hover:text-sam-fg"
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>
      {activeTab === "kpi" && (
        <div className="mb-4">
          <RecommendationReportKpiCards reportId={reportId} />
        </div>
      )}
      {activeTab === "sections" && (
        <AdminCard titleKey="admin_rec_report_card_section_perf">
          <RecommendationSectionReportTable reportId={reportId} />
        </AdminCard>
      )}
      {activeTab === "versions" && (
        <AdminCard titleKey="admin_rec_report_card_version_perf">
          <RecommendationVersionReportTable reportId={reportId} />
        </AdminCard>
      )}
      {activeTab === "analytics" && (
        <div className="space-y-4">
          <AdminCard titleKey="admin_rec_report_card_reason_top">
            <RecommendationReasonAnalyticsTable reportId={reportId} />
          </AdminCard>
          <AdminCard titleKey="admin_rec_report_card_category_perf">
            <RecommendationCategoryAnalyticsTable reportId={reportId} />
          </AdminCard>
          <AdminCard titleKey="admin_rec_report_card_region_perf">
            <RecommendationRegionAnalyticsTable reportId={reportId} />
          </AdminCard>
        </div>
      )}
      {activeTab === "briefing" && (
        <AdminCard titleKey="admin_rec_report_card_briefing">
          <RecommendationBriefingBoardCard reportId={reportId} />
        </AdminCard>
      )}
    </>
  );
}
