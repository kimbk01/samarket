"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo, useState } from "react";
import { getDrScenarios } from "@/lib/dr/mock-dr-scenarios";
import { AdminTable } from "@/components/admin/AdminTable";
import { getScenarioTypeLabel, getDrSeverityLabel } from "@/lib/dr/dr-utils";
import type { DrScenarioType, DrSeverity } from "@/lib/types/dr";
import Link from "next/link";

export function DrScenarioTable() {
  const { t } = useI18n();
  const [typeFilter, setTypeFilter] = useState<DrScenarioType | "">("");
  const [severityFilter, setSeverityFilter] = useState<DrSeverity | "">("");

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
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_dr_k74dab07c")}</span>
        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter((e.target.value || "") as DrScenarioType | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("common_all")}</option>
          <option value="db_down">{t("admin_db_failure")}</option>
          <option value="api_failure">{t("admin_api_failure")}</option>
          <option value="auth_failure">{t("admin_dr_k4804459c")}</option>
          <option value="storage_failure">{t("admin_dr_k02e6bf26")}</option>
          <option value="chat_failure">{t("admin_dr_chat")}</option>
          <option value="payment_failure">{t("admin_dr_k8440d176")}</option>
        </select>
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_qa_severity")}</span>
        <select
          value={severityFilter}
          onChange={(e) =>
            setSeverityFilter((e.target.value || "") as DrSeverity | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("common_all")}</option>
          <option value="low">{t("admin_qa_low")}</option>
          <option value="medium">{t("admin_qa_medium")}</option>
          <option value="high">{t("admin_qa_high")}</option>
          <option value="critical">{t("admin_qa_critical")}</option>
        </select>
      </div>

      {scenarios.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          해당 조건의 시나리오가 없습니다.
        </div>
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
                      ? "bg-red-100 text-red-800"
                      : s.severity === "high"
                        ? "bg-amber-100 text-amber-800"
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
