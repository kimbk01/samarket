"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getOperationStatus, getSystemHealth } from "@/lib/system/system-state";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
export function OperationStatusCards() {
  const { t } = useI18n();
  const status = useMemo(() => getOperationStatus(), []);
  const health = useMemo(() => getSystemHealth(), []);

  const allHealthy = health.length > 0 && health.every((h) => h.status === "healthy");
  const hasCritical = health.some((h) => h.status === "critical");
  const readiness = allHealthy && status.errorRate < 1 && !hasCritical;
  const readyForScale = readiness && status.uptime >= 99.9;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_system_ops_uptime")}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">{status.uptime}%</p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_system_ops_active_users")}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">{status.activeUsers}</p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_system_ops_error_rate")}</p>
          <p className="sam-text-page-title font-semibold text-sam-fg">{status.errorRate}%</p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="sam-text-helper text-sam-muted">{t("admin_system_ops_readiness")}</p>
          <p
            className={`sam-text-body font-semibold ${
              readiness ? "text-sam-success" : "text-sam-warning"
            }`}
          >
            {readiness ? t("admin_system_ops_ready") : t("admin_system_ops_needs_check")}
          </p>
        </div>
      </div>
      {readyForScale && (
        <div className="rounded-ui-rect border border-sam-success/40 bg-sam-success-soft/50 p-4 text-center">
          <p className="sam-text-page-title font-semibold text-sam-success">READY FOR SCALE</p>
          <p className="mt-1 sam-text-body-secondary text-sam-success">{t("admin_system_ops_scale_subtitle")}</p>
        </div>
      )}
      <p className="sam-text-helper text-sam-muted">
        {t("admin_system_ops_last_updated")} {formatAdminManilaDateTime(status.lastUpdatedAt)}
      </p>
    </div>
  );
}
