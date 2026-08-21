"use client";

import Link from "next/link";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  ADMIN_STORE_APPROVAL_LABEL_KEYS,
  type AdminStoreReviewRow,
} from "@/components/admin/stores/admin-store-review-model";
import { sbStatusBadgeClass } from "@/components/admin/stores/admin-store-review-ui";

export type AdminBusinessListRow = AdminStoreReviewRow & {
  owner_handle?: string | null;
  owner_username?: string | null;
};

interface AdminBusinessTableProps {
  rows: AdminBusinessListRow[];
}

export function AdminBusinessTable({ rows }: AdminBusinessTableProps) {
  const { t } = useI18n();
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[720px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_biz_th_name")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_biz_th_owner")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_biz_th_status")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_biz_th_applied")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_biz_th_manage")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const statusKey = ADMIN_STORE_APPROVAL_LABEL_KEYS[r.approval_status] as
              | MessageKey
              | undefined;
            const statusLabel = statusKey ? t(statusKey) : r.approval_status;
            const ownerLabel =
              (r.applicant_nickname ?? "").trim() ||
              (r.owner_handle ?? "").trim() ||
              (r.owner_username ?? "").trim() ||
              r.owner_user_id;
            const detailHref = `/admin/business/${encodeURIComponent(r.id)}`;
            return (
              <tr key={r.id} className="border-b border-sam-border-soft hover:bg-sam-app">
                <td className="px-3 py-2.5">
                  <Link
                    href={detailHref}
                    className="font-medium text-signature hover:underline"
                  >
                    {(r.store_name ?? "").trim() || t("admin_stores_no_store_name")}
                  </Link>
                  <div className="mt-0.5 font-mono text-[11px] text-sam-muted">{r.id}</div>
                </td>
                <td className="px-3 py-2.5 text-sam-fg">
                  <div>{ownerLabel}</div>
                  {r.owner_handle ? (
                    <div className="sam-text-helper text-sam-muted">{r.owner_handle}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${sbStatusBadgeClass(
                      r.approval_status
                    )}`}
                  >
                    {statusLabel}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {new Date(r.created_at).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-3 py-2.5">
                  <Link
                    href={detailHref}
                    className="inline-flex rounded border border-sam-border bg-sam-app px-2.5 py-1 sam-text-helper font-medium text-sam-fg hover:bg-sam-surface-muted"
                  >
                    {t("admin_biz_cta_manage")}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
