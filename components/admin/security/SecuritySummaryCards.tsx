"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getSecurityChecks } from "@/lib/security/mock-security-checks";
import { getSecurityIssues } from "@/lib/security/mock-security-issues";

export function SecuritySummaryCards() {
  const { t } = useI18n();
  const summary = useMemo(() => {
    const checks = getSecurityChecks();
    const issues = getSecurityIssues();
    const safe = checks.filter((c) => c.status === "safe").length;
    const warning = checks.filter((c) => c.status === "warning").length;
    const critical = checks.filter((c) => c.status === "critical").length;
    const openIssues = issues.filter((i) => i.status === "open").length;
    const criticalIssues = issues.filter(
      (i) => i.status === "open" && i.severity === "critical"
    ).length;
    return {
      totalChecks: checks.length,
      safe,
      warning,
      critical,
      openIssues,
      criticalIssues,
    };
  }, []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_security_k45d5aa2b")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.totalChecks}건
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_security_safe_warning_critical")}</p>
        <p className="sam-text-body text-sam-fg">
          <span className="text-emerald-600">{summary.safe}</span> /{" "}
          <span className="text-amber-600">{summary.warning}</span> /{" "}
          <span className="text-red-600">{summary.critical}</span>
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_launch_week_open_issues")}</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.openIssues}건
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">{t("admin_critical_issues")}</p>
        <p
          className={`sam-text-page-title font-semibold ${
            summary.criticalIssues > 0 ? "text-red-600" : "text-sam-fg"
          }`}
        >
          {summary.criticalIssues}건
        </p>
      </div>
    </div>
  );
}
