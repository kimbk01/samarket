"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getLaunchWeekSummary } from "@/lib/launch-week/launch-week-summary";
import { getStabilityLabel } from "@/lib/launch-week/launch-week-utils";
import Link from "next/link";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

export function LaunchWeekSummaryCards() {
  const { t } = useI18n();
  const summary = useMemo(() => getLaunchWeekSummary(), []);

  const stabilityClass =
    summary.currentStabilityStatus === "critical"
      ? "text-sam-danger"
      : summary.currentStabilityStatus === "warning"
        ? "text-sam-warning"
        : summary.currentStabilityStatus === "watch"
          ? "text-sam-warning"
          : "text-sam-success";

  const stabilityBg =
    summary.currentStabilityStatus === "critical"
      ? "border-sam-danger bg-sam-danger-soft"
      : summary.currentStabilityStatus === "warning"
        ? "border-sam-warning bg-sam-warning-soft"
        : summary.currentStabilityStatus === "watch"
          ? "border-sam-warning bg-sam-warning-soft"
          : "border-sam-success bg-sam-success-soft";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_launch_week_kc6c6e832")}</p>
          <p className="sam-text-hero font-semibold text-sam-fg">
            Day {summary.currentDay}
          </p>
        </div>
        <div className={`rounded-ui-rect border p-4 ${stabilityBg}`}>
          <p className="sam-text-helper text-sam-muted">{t("admin_launch_week_status")}</p>
          <p className={`sam-text-page-title font-semibold ${stabilityClass}`}>
            {getStabilityLabel(summary.currentStabilityStatus)}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_launch_week_open_issues_2")}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.openIssueCount} / {summary.criticalIssueCount}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_launch_week_checklist_2")}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.totalChecklistDone} / {summary.totalChecklistCount}
          </p>
          {summary.blockedChecklistCount > 0 && (
            <p className="mt-1 sam-text-helper text-sam-danger">
              차단 {summary.blockedChecklistCount}건
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_launch_week_ked90e83d")}</p>
          <p className="sam-text-body text-sam-fg">
            {summary.fallbackToday} / {summary.killSwitchToday}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_qa_link_2")}</p>
          <p className="sam-text-body text-sam-fg">
            <Link href="/admin/recommendation-monitoring" className="text-signature hover:underline">
              추천 모니터링
            </Link>
            {" · "}
            <Link href="/admin/feed-emergency" className="text-signature hover:underline">
              피드 장애대응
            </Link>
            {" · "}
            <Link href="/admin/ops-board" className="text-signature hover:underline">
              운영 보드
            </Link>
            {" · "}
            <Link href="/admin/recommendation-reports" className="text-signature hover:underline">
              운영 보고서
            </Link>
          </p>
        </div>
      </div>

      <p className="sam-text-helper text-sam-muted">
        첫 주 go/no-go after launch 판단은 요약·체크리스트 완료 후 placeholder로 기록 가능.
      </p>

      {summary.latestUpdatedAt && (
        <p className="sam-text-helper text-sam-muted">
          최종 갱신: {formatAdminManilaDateTime(summary.latestUpdatedAt)}
        </p>
      )}
    </div>
  );
}
