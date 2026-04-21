"use client";

import { useMemo } from "react";
import { getSecurityChecks } from "@/lib/security/mock-security-checks";
import { getSecurityIssues } from "@/lib/security/mock-security-issues";

export function SecuritySummaryCards() {
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
        <p className="sam-text-helper text-sam-muted">점검 항목</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.totalChecks}건
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">안전 / 주의 / 위험</p>
        <p className="sam-text-body text-sam-fg">
          <span className="text-emerald-600">{summary.safe}</span> /{" "}
          <span className="text-amber-600">{summary.warning}</span> /{" "}
          <span className="text-red-600">{summary.critical}</span>
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">미해결 이슈</p>
        <p className="sam-text-page-title font-semibold text-sam-fg">
          {summary.openIssues}건
        </p>
      </div>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <p className="sam-text-helper text-sam-muted">critical 이슈</p>
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
