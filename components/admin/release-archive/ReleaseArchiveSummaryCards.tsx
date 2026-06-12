"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getReleaseArchiveSummary } from "@/lib/release-archive/release-archive-summary";
import {
  getReleaseArchives,
  getReleaseArchiveItems,
  getReleaseRegressionIssues,
} from "@/lib/release-archive/release-archive-state";
export function ReleaseArchiveSummaryCards() {
  const { t } = useI18n();
  const { summary, latestImpact } = useMemo(() => {
    const summaryInner = getReleaseArchiveSummary();
    const archives = getReleaseArchives();
    const latest = [...archives].sort(
      (a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
    )[0];
    let latestImpactInner: { version: string; changeCount: number; regressionCount: number } | null =
      null;
    if (latest) {
      const changeCount = getReleaseArchiveItems(latest.id).length;
      const regressionCount = getReleaseRegressionIssues({
        releaseArchiveId: latest.id,
      }).length;
      latestImpactInner = { version: latest.releaseVersion, changeCount, regressionCount };
    }
    return { summary: summaryInner, latestImpact: latestImpactInner };
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_rel_summary_ratio")}</p>
          <p className="sam-text-body text-sam-fg">
            {summary.totalReleases} / {summary.activeReleases} /{" "}
            {summary.stableReleases} / {summary.rolledBackReleases}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_rel_summary_regression")}</p>
          <p className="sam-text-body text-sam-fg">
            {summary.totalRegressionIssues} /{" "}
            <span className={summary.openRegressionIssues > 0 ? "font-medium text-amber-700" : ""}>
              {summary.openRegressionIssues}
            </span>
            {" / "}
            <span className={summary.criticalRegressionIssues > 0 ? "font-medium text-red-600" : ""}>
              {summary.criticalRegressionIssues}
            </span>
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_rel_summary_avg_regression")}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.averageRegressionPerRelease}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_rel_summary_latest_date")}</p>
          <p className="sam-text-body font-medium text-sam-fg">
            {summary.latestReleaseAt}
          </p>
        </div>
        {latestImpact && (
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="sam-text-helper text-sam-muted">{t("admin_rel_summary_impact")}</p>
            <p className="sam-text-body font-medium text-sam-fg">
              v{latestImpact.version}
            </p>
            <p className="mt-1 sam-text-body-secondary text-sam-muted">
              {t("admin_rel_summary_impact_counts", {
                changes: latestImpact.changeCount,
                regressions: latestImpact.regressionCount,
              })}
            </p>
          </div>
        )}
      </div>
      <p className="sam-text-helper text-sam-muted">
        <Link href="/admin/release-notes" className="text-signature hover:underline">
          {t("admin_rel_link_release_notes")}
        </Link>
        {" · "}
        <Link href="/admin/dev-sprints" className="text-signature hover:underline">
          {t("admin_rel_link_sprint")}
        </Link>
        {" · "}
        <Link href="/admin/qa-board" className="text-signature hover:underline">
          {t("admin_rel_link_qa")}
        </Link>
      </p>
    </div>
  );
}
