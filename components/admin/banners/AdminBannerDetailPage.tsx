"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminBanner, BannerChangeLog } from "@/lib/types/admin-banner";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminBannerStatusBadge } from "./AdminBannerStatusBadge";
import { AdminBannerPreview } from "./AdminBannerPreview";
import { AdminBannerChangeLogList } from "./AdminBannerChangeLogList";
import { bannerPlacementLabel } from "./admin-banner-i18n";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

interface AdminBannerDetailPageProps {
  bannerId: string;
}

export function AdminBannerDetailPage({ bannerId }: AdminBannerDetailPageProps) {
  const { t } = useI18n();
  const [banner, setBanner] = useState<AdminBanner | null>(null);
  const [logs, setLogs] = useState<BannerChangeLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/banners/${bannerId}`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        banner?: AdminBanner;
        logs?: BannerChangeLog[];
      };
      if (j.ok && j.banner) {
        setBanner(j.banner);
        setLogs(Array.isArray(j.logs) ? j.logs : []);
      } else {
        setBanner(null);
        setLogs([]);
      }
    } catch {
      setBanner(null);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [bannerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleStatus = async (status: AdminBanner["status"]) => {
    const res = await fetch(`/api/admin/banners/${bannerId}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) void load();
  };

  if (loading) {
    return <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>;
  }

  if (!banner) {
    return (
      <div className="py-8 text-center sam-text-body text-sam-muted">
        {t("admin_banners_not_found")}
      </div>
    );
  }

  const placementLabel = bannerPlacementLabel(t, banner.placement);

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
          <AdminActionButton
            onClick={() => void handleStatus("active")}
            variant="primary"
          >
            {t("admin_banners_status_active")}
          </AdminActionButton>
        )}
        {banner.status === "active" && (
          <AdminActionButton
            onClick={() => void handleStatus("paused")}
            variant="secondary"
          >
            {t("admin_banners_status_paused")}
          </AdminActionButton>
        )}
        {(banner.status === "active" || banner.status === "paused") && (
          <AdminActionButton
            onClick={() => void handleStatus("hidden")}
            variant="secondary"
          >
            {t("admin_banners_status_hidden")}
          </AdminActionButton>
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
                ? `${formatAdminManilaDateTime(banner.startAt)} ~ ${formatAdminManilaDateTime(banner.endAt)}`
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
              {formatAdminManilaDateTime(banner.createdAt)} /{" "}
              {formatAdminManilaDateTime(banner.updatedAt)}
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
