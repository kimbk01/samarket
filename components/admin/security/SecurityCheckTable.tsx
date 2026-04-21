"use client";

import { useMemo, useState } from "react";
import { getSecurityChecks } from "@/lib/security/mock-security-checks";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getCheckTypeLabel,
  getSecurityStatusLabel,
} from "@/lib/security/security-utils";
import type { SecurityCheckType, SecurityStatus } from "@/lib/types/security";
import Link from "next/link";

export function SecurityCheckTable() {
  const [typeFilter, setTypeFilter] = useState<SecurityCheckType | "">("");
  const [statusFilter, setStatusFilter] = useState<SecurityStatus | "">("");

  const checks = useMemo(
    () =>
      getSecurityChecks({
        ...(typeFilter ? { checkType: typeFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
    [typeFilter, statusFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">점검 유형</span>
        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter((e.target.value || "") as SecurityCheckType | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">전체</option>
          <option value="rls">RLS</option>
          <option value="api">API</option>
          <option value="admin">관리자</option>
          <option value="auth">인증</option>
          <option value="storage">스토리지</option>
        </select>
        <span className="sam-text-body-secondary text-sam-muted">상태</span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter((e.target.value || "") as SecurityStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">전체</option>
          <option value="safe">안전</option>
          <option value="warning">주의</option>
          <option value="critical">위험</option>
        </select>
      </div>

      {checks.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          해당 조건의 점검 항목이 없습니다.
        </div>
      ) : (
        <AdminTable headers={["유형", "대상", "상태", "설명", "점검일", ""]}>
          {checks.map((c) => (
            <tr
              key={c.id}
              className={`border-b border-sam-border-soft ${
                c.status === "critical" ? "bg-red-50/30" : ""
              }`}
            >
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {getCheckTypeLabel(c.checkType)}
              </td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {c.target}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    c.status === "safe"
                      ? "bg-emerald-50 text-emerald-700"
                      : c.status === "critical"
                        ? "bg-red-100 text-red-800"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {getSecurityStatusLabel(c.status)}
                </span>
              </td>
              <td className="max-w-[200px] px-3 py-2.5 sam-text-body-secondary text-sam-muted line-clamp-2">
                {c.description}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(c.lastCheckedAt).toLocaleString()}
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/security?checkId=${c.id}`}
                  className="text-signature hover:underline"
                >
                  이슈
                </Link>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
