"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getSecurityChecks } from "@/lib/security/security-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  getCheckTypeLabel,
  getSecurityStatusLabel,
} from "@/lib/security/security-utils";
import type { SecurityCheckType, SecurityStatus } from "@/lib/types/security";
import Link from "next/link";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";
const FILTER_EXTRAS = ["type"] as const;

export function SecurityCheckTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const typeFilter = lq.query.extras.type as SecurityCheckType | "";
  const statusFilter = lq.query.status as SecurityStatus | "";

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
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
      >
        <AdminFilterSelect ko={ko} label={t("admin_security_k3e0fa017")} name="type" value={lq.query.extras.type} onChange={(v) => lq.setExtra("type", v)}>
          <option value="">{t("common_all")}</option>
          <option value="rls">RLS</option>
          <option value="api">API</option>
          <option value="admin">{t("admin_security_admin")}</option>
          <option value="auth">{t("admin_security_kce715622")}</option>
          <option value="storage">{t("admin_security_ke5b6b308")}</option>
        </AdminFilterSelect>
        <AdminFilterSelect ko={ko} label={t("admin_qa_status_2")} name="status" value={lq.query.status} onChange={lq.setStatus}>
          <option value="">{t("common_all")}</option>
          <option value="safe">{t("admin_security_safe")}</option>
          <option value="warning">{t("admin_security_warning")}</option>
          <option value="critical">{t("admin_security_critical")}</option>
        </AdminFilterSelect>
      </AdminFilterBar>

      {checks.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={lq.isFiltered ? undefined : "해당 조건의 점검 항목이 없습니다."}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : (
        <AdminTable headers={["유형", "대상", "상태", "설명", "점검일", ""]}>
          {checks.map((c) => (
            <tr
              key={c.id}
              className={`border-b border-sam-border-soft ${
                c.status === "critical" ? "bg-sam-danger-soft/30" : ""
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
                      ? "bg-sam-success-soft text-sam-success"
                      : c.status === "critical"
                        ? "bg-sam-danger-soft text-sam-danger"
                        : "bg-sam-warning-soft text-sam-warning"
                  }`}
                >
                  {getSecurityStatusLabel(c.status)}
                </span>
              </td>
              <td className="max-w-[200px] px-3 py-2.5 sam-text-body-secondary text-sam-muted line-clamp-2">
                {c.description}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {formatAdminManilaDateTime(c.lastCheckedAt)}
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
