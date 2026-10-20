"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo } from "react";
import { getDrScenarios } from "@/lib/dr/dr-state";
import { AdminTable } from "@/components/admin/AdminTable";
import { getScenarioTypeLabel, getDrSeverityLabel } from "@/lib/dr/dr-utils";
import type { DrScenarioType, DrSeverity } from "@/lib/types/dr";
import Link from "next/link";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const DR_EXTRAS = ["type", "severity"] as const;

export function DrScenarioTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 유형·심각도 필터는 주소(`?type=`·`?severity=`)에 보존 (R7). */
  const lq = useAdminListQuery({ extras: DR_EXTRAS });
  const typeFilter = lq.query.extras.type as DrScenarioType | "";
  const severityFilter = lq.query.extras.severity as DrSeverity | "";

  const scenarios = useMemo(
    () =>
      getDrScenarios({
        ...(typeFilter ? { scenarioType: typeFilter } : {}),
        ...(severityFilter ? { severity: severityFilter } : {}),
      }),
    [typeFilter, severityFilter]
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
        <AdminFilterSelect
          ko={ko}
          label={t("admin_dr_k74dab07c")}
          name="type"
          value={lq.query.extras.type}
          onChange={(v) => lq.setExtra("type", v)}
          allLabel={t("common_all")}
          options={[
            { value: "db_down", label: t("admin_db_failure") },
            { value: "api_failure", label: t("admin_api_failure") },
            { value: "auth_failure", label: t("admin_dr_k4804459c") },
            { value: "storage_failure", label: t("admin_dr_k02e6bf26") },
            { value: "chat_failure", label: t("admin_dr_chat") },
            { value: "payment_failure", label: t("admin_dr_k8440d176") },
          ]}
        />
        <AdminFilterSelect
          ko={ko}
          label={t("admin_qa_severity")}
          name="severity"
          value={lq.query.extras.severity}
          onChange={(v) => lq.setExtra("severity", v)}
          allLabel={t("common_all")}
          options={[
            { value: "low", label: t("admin_qa_low") },
            { value: "medium", label: t("admin_qa_medium") },
            { value: "high", label: t("admin_qa_high") },
            { value: "critical", label: t("admin_qa_critical") },
          ]}
        />
      </AdminFilterBar>

      {scenarios.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={lq.isFiltered ? undefined : "해당 조건의 시나리오가 없습니다."}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : (
        <AdminTable headers={["제목", "유형", "심각도", "설명", ""]}>
          {scenarios.map((s) => (
            <tr key={s.id} className="border-b border-sam-border-soft">
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {s.title}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {getScenarioTypeLabel(s.scenarioType)}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    s.severity === "critical"
                      ? "bg-sam-danger-soft text-sam-danger"
                      : s.severity === "high"
                        ? "bg-sam-warning-soft text-sam-warning"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getDrSeverityLabel(s.severity)}
                </span>
              </td>
              <td className="max-w-[300px] px-3 py-2.5 sam-text-body-secondary text-sam-muted line-clamp-2">
                {s.description}
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/dr/${s.id}`}
                  className="text-signature hover:underline"
                >
                  상세
                </Link>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
