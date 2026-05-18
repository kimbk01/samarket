"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminBanner } from "@/lib/types/admin-banner";
import {
  getBannerForAdminById,
  setBannerStatus,
} from "@/lib/admin-banners/mock-admin-banners";
import { getBannerChangeLogs } from "@/lib/admin-banners/mock-banner-change-logs";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminBannerStatusBadge } from "./AdminBannerStatusBadge";
import { AdminBannerPreview } from "./AdminBannerPreview";
import { AdminBannerChangeLogList } from "./AdminBannerChangeLogList";
import { bannerPlacementLabel } from "./admin-banner-i18n";

interface AdminBannerDetailPageProps {
  bannerId: string;
}

export function AdminBannerDetailPage({ bannerId }: AdminBannerDetailPageProps) {
  const { t } = useI18n();
  const [refresh, setRefresh] = useState(0);
  const banner = useMemo(
    () => getBannerForAdminById(bannerId),
    [bannerId, refresh]
  );
  const logs = getBannerChangeLogs(bannerId);
  const refreshDetail = useCallback(() => setRefresh((r) => r + 1), []);

  if (!banner) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        {t("admin_banners_not_found")}
      </div>
    );
  }

  const placementLabel = bannerPlacementLabel(t, banner.placement);

  const handleStatus = (status: AdminBanner["status"]) => {
    setBannerStatus(bannerId, status);
    refreshDetail();
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_banners_page_detail" backHref="/admin/banners" />
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/admin/banners/${bannerId}/edit`}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg hover:bg-sam-app"
        >
          {t("common_edit")}
        </Link>
        <span className="rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary text-sam-meta">
          {t("admin_banners_action_reorder_planned")}
        </span>
        {(banner.status === "draft" || banner.status === "paused" || banner.status === "hidden") && (
          <button
            type="button"
            onClick={() => handleStatus("active")}
            className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 sam-text-body text-emerald-800 hover:bg-emerald-100"
          >
            {t("admin_banners_status_active")}
          </button>
        )}
        {banner.status === "active" && (
          <button
            type="button"
            onClick={() => handleStatus("paused")}
            className="rounded border border-amber-200 bg-amber-50 px-3 py-2 sam-text-body text-amber-800 hover:bg-amber-100"
          >
            {t("admin_banners_status_paused")}
          </button>
        )}
        {(banner.status === "active" || banner.status === "paused") && (
          <button
            type="button"
            onClick={() => handleStatus("hidden")}
            className="rounded border border-red-200 bg-red-50 px-3 py-2 sam-text-body text-red-700 hover:bg-red-100"
          >
            {t("admin_banners_status_hidden")}
          </button>
        )}
      </div>

      <AdminCard titleKey="admin_banners_card_info">
        <dl className="grid gap-2 sam-text-body">
          <div>
            <dt className="text-sam-muted">{t("admin_banners_label_title")}</dt>
            <dd className="font-medium text-sam-fg">{banner.title || t("admin_banners_no_title")}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_banners_label_description")}</dt>
            <dd className="text-sam-fg">{banner.description || "-"}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_banners_label_placement")}</dt>
            <dd>{placementLabel}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_banners_label_status")}</dt>
            <dd>
              <AdminBannerStatusBadge status={banner.status} />
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_banners_label_priority")}</dt>
            <dd>{banner.priority}</dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_banners_label_period")}</dt>
            <dd>
              {banner.startAt && banner.endAt
                ? `${new Date(banner.startAt).toLocaleString()} ~ ${new Date(banner.endAt).toLocaleString()}`
                : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_banners_label_click_url")}</dt>
            <dd className="truncate text-sam-fg">
              {banner.targetUrl ? (
                <a
                  href={banner.targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-signature hover:underline"
                >
                  {banner.targetUrl}
                </a>
              ) : (
                "-"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-sam-muted">{t("admin_banners_label_click_impression")}</dt>
            <dd>
              {banner.clickCount} / {banner.impressionCount}
            </dd>
          </div>
          {banner.adminMemo && (
            <div>
              <dt className="text-sam-muted">{t("admin_banners_label_admin_memo")}</dt>
              <dd className="whitespace-pre-wrap text-sam-fg">{banner.adminMemo}</dd>
            </div>
          )}
          <div>
            <dt className="text-sam-muted">{t("admin_banners_label_dates")}</dt>
            <dd className="sam-text-body-secondary text-sam-muted">
              {new Date(banner.createdAt).toLocaleString()} /{" "}
              {new Date(banner.updatedAt).toLocaleString()}
            </dd>
          </div>
        </dl>
      </AdminCard>

      <AdminCard titleKey="admin_banners_card_preview">
        <AdminBannerPreview banner={banner} />
      </AdminCard>

      <AdminCard titleKey="admin_banners_card_changelog">
        <AdminBannerChangeLogList logs={logs} />
      </AdminCard>
    </div>
  );
}
