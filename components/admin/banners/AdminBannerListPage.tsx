"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  const [filters, setFilters] = useState<AdminBannerFilters>(DEFAULT_FILTERS);
  const banners = useMemo(() => getBannersForAdmin(), []);
  const filtered = useMemo(
    () => filterBanners(banners, filters),
    [banners, filters]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminPageHeader title="배너 목록" />
        <Link
          href="/admin/banners/create"
          className="rounded border border-signature bg-sam-surface px-3 py-2 text-[14px] font-medium text-signature hover:bg-signature/5"
        >
          배너 등록
        </Link>
      </div>
      <AdminBannerFilterBar filters={filters} onChange={setFilters} />
      {filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
          조건에 맞는 배너가 없습니다.
        </div>
      ) : (
        <AdminBannerTable banners={filtered} />
      )}
    </div>
  );
}
