"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getBannersForAdmin } from "@/lib/admin-banners/mock-admin-banners";
import { filterBanners, type AdminBannerFilters } from "@/lib/admin-banners/admin-banner-utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminBannerFilterBar } from "./AdminBannerFilterBar";
import { AdminBannerTable } from "./AdminBannerTable";

const DEFAULT_FILTERS: AdminBannerFilters = {
  status: "",
  placement: "",
};

export function AdminBannerListPage() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<AdminBannerFilters>(DEFAULT_FILTERS);
  const banners = useMemo(() => getBannersForAdmin(), []);
  const filtered = useMemo(
    () => filterBanners(banners, filters),
    [banners, filters]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminPageHeader titleKey="admin_banners_page_list" />
        <Link
          href="/admin/banners/create"
          className="rounded border border-signature bg-sam-surface px-3 py-2 sam-text-body font-medium text-signature hover:bg-signature/5"
        >
          {t("admin_banners_btn_create")}
        </Link>
      </div>
      <AdminBannerFilterBar filters={filters} onChange={setFilters} />
      {filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_banners_empty_filtered")}
        </div>
      ) : (
        <AdminBannerTable banners={filtered} />
      )}
    </div>
  );
}