"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { filterBanners, type AdminBannerFilters } from "@/lib/admin-banners/admin-banner-utils";
import type { AdminBanner } from "@/lib/types/admin-banner";
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
  const [banners, setBanners] = useState<AdminBanner[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/banners", { cache: "no-store", credentials: "include" });
      const j = (await res.json()) as { ok?: boolean; banners?: AdminBanner[] };
      setBanners(j.ok && Array.isArray(j.banners) ? j.banners : []);
    } catch {
      setBanners([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => filterBanners(banners, filters), [banners, filters]);

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
      {loading ? (
        <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_banners_empty_filtered")}
        </div>
      ) : (
        <AdminBannerTable banners={filtered} />
      )}
    </div>
  );
}
