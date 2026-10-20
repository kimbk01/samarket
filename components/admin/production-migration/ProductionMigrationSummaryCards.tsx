"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getProductionMigrationSummary } from "@/lib/production-migration/production-migration-summary";
import { getGoLiveLabel } from "@/lib/production-migration/production-migration-utils";
import Link from "next/link";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
export function ProductionMigrationSummaryCards() {
  const { t } = useI18n();
  const summary = useMemo(() => getProductionMigrationSummary(), []);

  const goClass =
    summary.goLiveRecommendation === "go"
      ? "text-sam-success"
      : summary.goLiveRecommendation === "conditional_go"
        ? "text-sam-warning"
        : "text-sam-danger";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_prod_migration_kfac1ca9e")}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.productionReadyTables} / {summary.totalTables} 준비
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_rls_policy")}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.verifiedRlsChecks} / {summary.totalRlsChecks} 검증
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_prod_migration_k876c28e3")}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">
            {summary.readyInfraChecks} / {summary.totalInfraChecks} 준비
          </p>
        </div>
        <div
          className={`rounded-ui-rect border p-4 ${
            summary.goLiveRecommendation === "no_go"
              ? "border-sam-danger/40 bg-sam-danger-soft/50"
              : summary.goLiveRecommendation === "conditional_go"
                ? "border-sam-warning/40 bg-sam-warning-soft/50"
                : "border-sam-success/40 bg-sam-success-soft/30"
          }`}
        >
          <p className="sam-text-helper text-sam-muted">{t("admin_prod_migration_k538f307a")}</p>
          <p className={`sam-text-page-title font-semibold ${goClass}`}>
            {getGoLiveLabel(summary.goLiveRecommendation)}
          </p>
          {summary.blockedChecks > 0 && (
            <p className="mt-1 sam-text-helper text-sam-danger">
              차단 {summary.blockedChecks}건
            </p>
          )}
        </div>
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_prod_migration_checklist_deploy_2")}</p>
        <p className="sam-text-body text-sam-fg">
          완료 {summary.doneLaunchChecks} / {summary.totalLaunchChecks}
        </p>
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          <Link href="/admin/launch-readiness" className="text-signature hover:underline">
            런칭 준비
          </Link>
          {" · "}
          <Link href="/admin/ops-board" className="text-signature hover:underline">
            운영 보드
          </Link>
        </p>
      </div>

      {summary.latestUpdatedAt && (
        <p className="sam-text-helper text-sam-muted">
          최종 갱신: {formatAdminManilaDateTime(summary.latestUpdatedAt)}
        </p>
      )}
    </div>
  );
}
