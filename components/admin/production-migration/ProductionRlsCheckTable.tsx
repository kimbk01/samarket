"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo, useState } from "react";
import { getProductionRlsChecks } from "@/lib/production-migration/production-migration-state";
import { AdminTable } from "@/components/admin/AdminTable";
import { getRlsStatusLabel } from "@/lib/production-migration/production-migration-utils";
import type { ProductionRlsCheckStatus } from "@/lib/types/production-migration";

export function ProductionRlsCheckTable() {
  const { t } = useI18n();
  const [status, setStatus] = useState<ProductionRlsCheckStatus | "">("");
  const checks = useMemo(
    () =>
      getProductionRlsChecks(
        status ? { status: status as ProductionRlsCheckStatus } : undefined
      ),
    [status]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_qa_status_2")}</span>
        <select
          value={status}
          onChange={(e) =>
            setStatus((e.target.value || "") as ProductionRlsCheckStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("common_all")}</option>
          <option value="missing">{t("admin_prod_migration_kdd9b3e2e")}</option>
          <option value="draft">{t("admin_prod_migration_kd9aaeb45")}</option>
          <option value="ready">{t("admin_prod_migration_k0ea2b779")}</option>
          <option value="verified">{t("admin_qa_verified")}</option>
        </select>
      </div>

      {checks.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          RLS 점검 항목이 없습니다.
        </div>
      ) : (
        <AdminTable
          headers={["테이블", "정책명", "유형", "역할", "상태", "비고"]}
        >
          {checks.map((c) => (
            <tr
              key={c.id}
              className={`border-b border-sam-border-soft ${
                c.status === "missing" ? "bg-red-50/30" : ""
              }`}
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {c.tableName}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {c.policyName}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {c.policyType}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {c.roleScope}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    c.status === "verified"
                      ? "bg-emerald-100 text-emerald-800"
                      : c.status === "missing"
                        ? "bg-red-100 text-red-800"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {getRlsStatusLabel(c.status)}
                </span>
              </td>
              <td className="max-w-[200px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {c.note || "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
