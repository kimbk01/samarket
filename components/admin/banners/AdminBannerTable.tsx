"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminBanner } from "@/lib/types/admin-banner";
import { AdminBannerStatusBadge } from "./AdminBannerStatusBadge";
import { bannerPlacementLabel } from "./admin-banner-i18n";

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
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_banners_th_click_impression")}
            </th>
          </tr>
        </thead>
        <tbody>
          {banners.map((b) => {
            const placementLabel = bannerPlacementLabel(t, b.placement);
            const period =
              b.startAt && b.endAt
                ? `${new Date(b.startAt).toLocaleDateString()} ~ ${new Date(b.endAt).toLocaleDateString()}`
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
                  <AdminBannerStatusBadge status={b.status} />
                </td>
                <td className="px-3 py-2.5 text-sam-fg">{b.priority}</td>
                <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {period}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {b.clickCount} / {b.impressionCount}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
