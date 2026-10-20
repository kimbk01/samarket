"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getProductionRlsChecks } from "@/lib/production-migration/production-migration-state";
import { AdminTable } from "@/components/admin/AdminTable";
import { getRlsStatusLabel } from "@/lib/production-migration/production-migration-utils";
import type { ProductionRlsCheckStatus } from "@/lib/types/production-migration";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

export function ProductionRlsCheckTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery();
  const status = lq.query.status as ProductionRlsCheckStatus | "";
  const checks = useMemo(
    () =>
      getProductionRlsChecks(
        status ? { status: status as ProductionRlsCheckStatus } : undefined
      ),
    [status]
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
        <AdminFilterSelect ko={ko} label={t("admin_qa_status_2")} name="status" value={lq.query.status} onChange={lq.setStatus}>
          <option value="">{t("common_all")}</option>
          <option value="missing">{t("admin_prod_migration_kdd9b3e2e")}</option>
          <option value="draft">{t("admin_prod_migration_kd9aaeb45")}</option>
          <option value="ready">{t("admin_prod_migration_k0ea2b779")}</option>
          <option value="verified">{t("admin_qa_verified")}</option>
        </AdminFilterSelect>
      </AdminFilterBar>

      {checks.length === 0 ? (
        <AdminEmptyState ko={ko} message={"RLS 점검 항목이 없습니다."} onReset={lq.isFiltered ? lq.reset : undefined} />
      ) : (
        <AdminTable
          headers={["테이블", "정책명", "유형", "역할", "상태", "비고"]}
        >
          {checks.map((c) => (
            <tr
              key={c.id}
              className={`border-b border-sam-border-soft ${
                c.status === "missing" ? "bg-sam-danger-soft/30" : ""
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
                      ? "bg-sam-success-soft text-sam-success"
                      : c.status === "missing"
                        ? "bg-sam-danger-soft text-sam-danger"
                        : "bg-sam-warning-soft text-sam-warning"
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
