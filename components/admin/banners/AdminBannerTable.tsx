"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminBanner } from "@/lib/types/admin-banner";
import { AdminBannerStatusBadge } from "./AdminBannerStatusBadge";
import { bannerPlacementLabel } from "./admin-banner-i18n";
import { formatAdminManilaDate } from "@/lib/admin/metrics/manila-period";
import { adminBannerDisplayStatus } from "@/lib/admin-banners/admin-banner-utils";

interface AdminBannerTableProps {
  banners: AdminBanner[];
}

export function AdminBannerTable({ banners }: AdminBannerTableProps) {
  const { t } = useI18n();

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_banners_label_title")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_banners_label_placement")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_banners_label_status")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_banners_label_priority")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_banners_label_period")}
            </th>
          </tr>
        </thead>
        <tbody>
          {banners.map((b) => {
            const placementLabel = bannerPlacementLabel(t, b.placement);
            const period =
              b.startAt && b.endAt
                ? `${formatAdminManilaDate(b.startAt)} ~ ${formatAdminManilaDate(b.endAt)}`
                : "-";
            return (
              <tr
                key={b.id}
                className="border-b border-sam-border-soft hover:bg-sam-app"
              >
                <td className="px-3 py-2.5">
                  <Link
                    href={`/admin/banners/${b.id}`}
                    className="font-medium text-signature hover:underline"
                  >
                    {b.title || t("admin_banners_no_title")}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-sam-fg">{placementLabel}</td>
                <td className="px-3 py-2.5">
                  <AdminBannerStatusBadge status={adminBannerDisplayStatus(b)} />
                </td>
                <td className="px-3 py-2.5 text-sam-fg">{b.priority}</td>
                <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {period}
                </td>
                {/* D-14 (Owner 2026-11-04): 마이 배너는 노출·클릭을 쌓지 않아(항상 0) 칸을 보이지 않는다 */}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
