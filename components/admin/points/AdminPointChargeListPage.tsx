"use client";

import { useMemo, useState } from "react";
import { getPointChargeRequestsForAdmin } from "@/lib/points/mock-point-charge-requests";
import {
  filterPointChargeRequests,
  type AdminPointChargeFilters,
} from "@/lib/points/point-utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPointChargeFilterBar } from "./AdminPointChargeFilterBar";
import { AdminPointChargeTable } from "./AdminPointChargeTable";

const DEFAULT_FILTERS: AdminPointChargeFilters = {
  requestStatus: "",
};

export function AdminPointChargeListPage() {
  const [filters, setFilters] = useState<AdminPointChargeFilters>(DEFAULT_FILTERS);
  const requests = useMemo(() => getPointChargeRequestsForAdmin(), []);
  const filtered = useMemo(
    () => filterPointChargeRequests(requests, filters),
    [requests, filters]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader title="포인트 충전 신청" />
      <AdminPointChargeFilterBar filters={filters} onChange={setFilters} />
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
          조건에 맞는 충전 신청이 없습니다.
        </div>
      ) : (
        <AdminPointChargeTable requests={filtered} />
      )}
    </div>
  );
}
