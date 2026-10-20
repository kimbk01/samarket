"use client";

/**
 * 자동화 실행 로그 — 서버 페이지 (`GET /api/admin/automation?part=logs`, R7).
 * 전체를 한 번에 그리던 목록 대체 — 쪽·크기(20/50/100)는 주소에 보존, 「총 N건」.
 */

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getAutomationRuleById } from "@/lib/automation/automation-state";
import type { AutomationLog } from "@/lib/types/automation";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminServerListFrame } from "@/components/admin/sync-list/AdminServerListFrame";
import { useAdminServerPage } from "@/components/admin/sync-list/useAdminServerPage";

export function AutomationLogList() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const lq = useAdminListQuery();
  const page = useAdminServerPage<AutomationLog>(`/api/admin/automation?part=logs&${lq.apiQueryString}`, lq.refreshKey);

  return (
    <div className="space-y-4">
      <p className="sam-text-helper text-sam-muted">{t("admin_automation_logs_helper")}</p>
      <AdminServerListFrame
        ko={ko}
        state={page}
        page={lq.query.page}
        size={lq.query.size}
        onPageChange={lq.setPage}
        onSizeChange={lq.setSize}
        onRetry={lq.refresh}
        emptyMessage={t("admin_automation_logs_empty")}
      >
        {(logs) => (
          <ul className="space-y-2">
            {logs.map((l) => {
              const rule = getAutomationRuleById(l.ruleId);
              return (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3 sam-text-body-secondary text-sam-fg"
                >
                  <span className="font-medium">{rule?.ruleName ?? l.ruleId}</span>
                  <span className="text-sam-muted">{formatAdminManilaDateTime(l.triggeredAt)}</span>
                  <span className="text-sam-muted">→ {l.actionResult}</span>
                </li>
              );
            })}
          </ul>
        )}
      </AdminServerListFrame>
    </div>
  );
}
