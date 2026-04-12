"use client";

import { useMemo, useState } from "react";
import { getAdApplicationsForAdmin } from "@/lib/ads/mock-ad-applications";
import {
  filterAdApplications,
  type AdminAdApplicationFilters,
} from "@/lib/ads/ad-utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminAdApplicationFilterBar } from "./AdminAdApplicationFilterBar";
import { AdminAdApplicationTable } from "./AdminAdApplicationTable";

const DEFAULT_FILTERS: AdminAdApplicationFilters = {
  applicationStatus: "",
};

export function AdminAdApplicationListPage() {
  const [filters, setFilters] = useState<AdminAdApplicationFilters>(DEFAULT_FILTERS);
  const applications = useMemo(() => getAdApplicationsForAdmin(), []);
  const filtered = useMemo(
    () => filterAdApplications(applications, filters),
    [applications, filters]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader title="광고 신청 목록" />
      <AdminAdApplicationFilterBar filters={filters} onChange={setFilters} />
      {filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
          조건에 맞는 광고 신청이 없습니다.
        </div>
      ) : (
        <AdminAdApplicationTable applications={filtered} />
      )}
    </div>
  );
}
