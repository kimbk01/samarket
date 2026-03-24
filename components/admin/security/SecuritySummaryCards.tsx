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
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">점검 항목</p>
        <p className="text-[20px] font-semibold text-gray-900">
          {summary.totalChecks}건
        </p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">안전 / 주의 / 위험</p>
        <p className="text-[14px] text-gray-700">
          <span className="text-emerald-600">{summary.safe}</span> /{" "}
          <span className="text-amber-600">{summary.warning}</span> /{" "}
          <span className="text-red-600">{summary.critical}</span>
        </p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">미해결 이슈</p>
        <p className="text-[20px] font-semibold text-gray-900">
          {summary.openIssues}건
        </p>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-[12px] text-gray-500">critical 이슈</p>
        <p
          className={`text-[20px] font-semibold ${
            summary.criticalIssues > 0 ? "text-red-600" : "text-gray-900"
          }`}
        >
          {summary.criticalIssues}건
        </p>
      </div>
    </div>
  );
}
