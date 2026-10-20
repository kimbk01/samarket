"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ReleaseRegressionIssue } from "@/lib/types/release-archive";
import {
  REGRESSION_SEVERITY_KEYS,
  REGRESSION_STATUS_KEYS,
  REGRESSION_CATEGORY_KEYS,
} from "@/components/admin/i18n/admin-release-label-keys";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
interface RegressionIssueCardProps {
  issue: ReleaseRegressionIssue;
  isRepeatingPattern?: boolean;
}

export function RegressionIssueCard({
  issue,
  isRepeatingPattern = false,
}: RegressionIssueCardProps) {
  const { t } = useI18n();
  const isOpen = !["fixed", "verified", "archived"].includes(issue.status);
  const isCritical = issue.severity === "critical";

  return (
    <div
      className={`rounded-ui-rect border p-4 ${
        isCritical && isOpen
          ? "border-sam-danger/40 bg-sam-danger-soft/50"
          : isRepeatingPattern
            ? "border-sam-warning/40 bg-sam-warning-soft/30"
            : "border-sam-border bg-sam-surface"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5 sam-text-helper text-sam-muted">
        <span>{t(REGRESSION_CATEGORY_KEYS[issue.regressionCategory])}</span>
        <span
          className={`rounded px-1.5 py-0.5 ${
            isCritical ? "bg-sam-danger-soft text-sam-danger" : "bg-sam-surface-muted text-sam-muted"
          }`}
        >
          {t(REGRESSION_SEVERITY_KEYS[issue.severity])}
        </span>
        <span
          className={`rounded px-1.5 py-0.5 ${
            issue.status === "verified" || issue.status === "fixed"
              ? "bg-sam-success-soft text-sam-success"
              : issue.status === "detected" || issue.status === "investigating"
                ? "bg-sam-warning-soft text-sam-warning"
                : "bg-sam-surface-muted text-sam-muted"
          }`}
        >
          {t(REGRESSION_STATUS_KEYS[issue.status])}
        </span>
        {isRepeatingPattern && (
          <span className="rounded bg-sam-warning-soft px-1.5 py-0.5 text-sam-warning">
            {t("admin_rel_repeat_pattern")}
          </span>
        )}
      </div>
      <p className="mt-2 font-medium text-sam-fg">{issue.title}</p>
      {issue.description && (
        <p className="mt-1 line-clamp-2 sam-text-body-secondary text-sam-muted">
          {issue.description}
        </p>
      )}
      <p className="mt-2 sam-text-helper text-sam-muted">
        {t("admin_rel_detected_at", { at: formatAdminManilaDateTime(issue.detectedAt) })}
        {issue.fixedAt
          ? t("admin_rel_fixed_at", { at: formatAdminManilaDateTime(issue.fixedAt) })
          : null}
        {issue.ownerAdminNickname && ` · ${issue.ownerAdminNickname}`}
      </p>
      <div className="mt-2 flex flex-wrap gap-1 sam-text-helper">
        {issue.linkedQaIssueId && (
          <Link href="/admin/qa-board" className="text-signature hover:underline">
            QA
          </Link>
        )}
        {issue.linkedBacklogItemId && (
          <Link href="/admin/product-backlog" className="text-signature hover:underline">
            {t("admin_rel_backlog")}
          </Link>
        )}
        {issue.linkedHotfixReleaseId && (
          <Link href="/admin/release-archive" className="text-signature hover:underline">
            {t("admin_rel_hotfix_link")}
          </Link>
        )}
      </div>
    </div>
  );
}
