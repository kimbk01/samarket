"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getProductionInfraChecks } from "@/lib/production-migration/production-migration-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getInfraCategoryLabel,
  getInfraStatusLabel,
} from "@/lib/production-migration/production-migration-utils";
import type {
  ProductionInfraCategory,
  ProductionInfraCheckStatus,
} from "@/lib/types/production-migration";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const FILTER_EXTRAS = ["category"] as const;

export function ProductionInfraCheckTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const category = lq.query.extras.category as ProductionInfraCategory | "";
  const checks = useMemo(
    () =>
      getProductionInfraChecks(
        category
          ? { category: category as ProductionInfraCategory }
          : undefined
      ),
    [category]
  );

  const categories = [
    { value: "" as const, label: "전체" },
    { value: "storage_bucket" as const, label: "스토리지 버킷" },
    { value: "env_secret" as const, label: "Env/Secret" },
    { value: "webhook" as const, label: "Webhook" },
    { value: "cron" as const, label: "Cron" },
    { value: "edge_function" as const, label: "Edge Function" },
    { value: "rpc" as const, label: "RPC" },
    { value: "trigger" as const, label: "Trigger" },
  ];

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
        <AdminFilterSelect ko={ko} label={t("admin_qa_category")} name="category" value={lq.query.extras.category} onChange={(v) => lq.setExtra("category", v)}>
          {categories.map((c) => (
            <option key={c.value || "all"} value={c.value}>
              {c.label}
            </option>
          ))}
        </AdminFilterSelect>
      </AdminFilterBar>

      {checks.length === 0 ? (
        <AdminEmptyState ko={ko} message={"인프라 점검 항목이 없습니다."} onReset={lq.isFiltered ? lq.reset : undefined} />
      ) : (
        <AdminTable
          headers={["분류", "대상", "상태", "차단 사유", "비고"]}
        >
          {checks.map((c) => (
            <tr
              key={c.id}
              className={`border-b border-sam-border-soft ${
                c.blockerReason ? "bg-sam-danger-soft/30" : ""
              }`}
            >
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {getInfraCategoryLabel(c.category)}
              </td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {c.targetName}
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
                  {getInfraStatusLabel(c.status)}
                </span>
              </td>
              <td className="max-w-[180px] px-3 py-2.5 sam-text-body-secondary text-sam-danger">
                {c.blockerReason ?? "-"}
              </td>
              <td className="max-w-[160px] truncate px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {c.note || "-"}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
