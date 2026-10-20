"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getSecurityIssues, getSecurityCheckById } from "@/lib/security/security-state";
import {
  getIssueSeverityLabel,
  getIssueStatusLabel,
  getCheckTypeLabel,
} from "@/lib/security/security-utils";
import type { SecurityIssueStatus } from "@/lib/types/security";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const FILTER_EXTRAS = ["issue_status"] as const;

export function SecurityIssueList() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const statusFilter = lq.query.extras.issue_status as SecurityIssueStatus | "";
  const issues = useMemo(
    () =>
      getSecurityIssues(
        statusFilter ? { status: statusFilter } : undefined
      ),
    [statusFilter]
  );

  return (
    <div className="space-y-4">
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
      >
        <AdminFilterSelect ko={ko} label={t("admin_security_status_issues")} name="issue_status" value={lq.query.extras.issue_status} onChange={(v) => lq.setExtra("issue_status", v)}>
          <option value="">{t("common_all")}</option>
          <option value="open">{t("admin_qa_open_2")}</option>
          <option value="fixed">{t("admin_launch_week_resolved")}</option>
        </AdminFilterSelect>
      </AdminFilterBar>

      {issues.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={lq.isFiltered ? undefined : "해당 조건의 보안 이슈가 없습니다."}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : (
        <ul className="space-y-2">
          {issues.map((i) => {
            const check = getSecurityCheckById(i.checkId);
            return (
              <li
                key={i.id}
                className={`rounded-ui-rect border p-4 ${
                  i.severity === "critical" && i.status === "open"
                    ? "border-sam-danger/40 bg-sam-danger-soft/30"
                    : "border-sam-border bg-sam-surface"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 sam-text-helper text-sam-muted">
                  <span>
                    {check ? getCheckTypeLabel(check.checkType) : i.checkId}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 ${
                      i.severity === "critical"
                        ? "bg-sam-danger-soft text-sam-danger"
                        : i.severity === "high"
                          ? "bg-sam-warning-soft text-sam-warning"
                          : "bg-sam-surface-muted text-sam-muted"
                    }`}
                  >
                    {getIssueSeverityLabel(i.severity)}
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 ${
                      i.status === "fixed"
                        ? "bg-sam-success-soft text-sam-success"
                        : "bg-sam-warning-soft text-sam-warning"
                    }`}
                  >
                    {getIssueStatusLabel(i.status)}
                  </span>
                </div>
                <p className="mt-2 font-medium text-sam-fg">{i.issueTitle}</p>
                {i.note && (
                  <p className="mt-1 sam-text-body-secondary text-sam-muted">{i.note}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
