"use client";

import Link from "next/link";
import type { BusinessProfile } from "@/lib/types/business";
import type { BusinessProfileStatus } from "@/lib/types/business";
import type { MessageKey } from "@/lib/i18n/messages";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const STATUS_CLASS: Record<BusinessProfile["status"], string> = {
  pending: "bg-amber-100 text-amber-800",
  active: "bg-emerald-50 text-emerald-800",
  paused: "bg-sam-border-soft text-sam-fg",
  rejected: "bg-red-50 text-red-700",
};

interface AdminBusinessTableProps {
  profiles: BusinessProfile[];
}

const STATUS_LABEL_KEYS: Record<BusinessProfileStatus, MessageKey> = {
  pending: "admin_biz_status_pending",
  active: "admin_biz_status_active",
  paused: "admin_biz_status_paused",
  rejected: "admin_biz_status_rejected",
};

export function AdminBusinessTable({ profiles }: AdminBusinessTableProps) {
  const { t } = useI18n();
  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_biz_th_name")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_biz_th_owner")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_biz_th_status")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_biz_th_stats")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_biz_th_applied")}</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((p) => (
            <tr
              key={p.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/business/${p.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {p.shopName}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {p.ownerNickname} ({p.ownerUserId})
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${STATUS_CLASS[p.status]}`}
                >
                  {t(STATUS_LABEL_KEYS[p.status])}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-muted">
                {p.productCount} / {p.reviewCount}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(p.createdAt).toLocaleDateString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
