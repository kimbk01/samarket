"use client";

import { useMemo, useState } from "react";
import { getProductionRlsChecks } from "@/lib/production-migration/mock-production-rls-checks";
import { AdminTable } from "@/components/admin/AdminTable";
import { getRlsStatusLabel } from "@/lib/production-migration/production-migration-utils";
import type { ProductionRlsCheckStatus } from "@/lib/types/production-migration";

export function ProductionRlsCheckTable() {
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
        <span className="sam-text-body-secondary text-sam-muted">상태</span>
        <select
          value={status}
          onChange={(e) =>
            setStatus((e.target.value || "") as ProductionRlsCheckStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">전체</option>
          <option value="missing">미작성</option>
          <option value="draft">초안</option>
          <option value="ready">준비</option>
          <option value="verified">검증됨</option>
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
