"use client";

import { useMemo, useState } from "react";
import { getPointChargeRequestsForAdmin } from "@/lib/points/mock-point-charge-requests";
import {
  filterPointChargeRequests,
  type AdminPointChargeFilters,
} from "@/lib/points/point-utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPointChargeFilterBar } from "./AdminPointChargeFilterBar";
import { AdminPointChargeInlineActions } from "./AdminPointChargeInlineActions";

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

  const counts = {
    total: requests.length,
    waiting: requests.filter((r) => r.requestStatus === "waiting_confirm").length,
    pending: requests.filter((r) => r.requestStatus === "pending").length,
    approved: requests.filter((r) => r.requestStatus === "approved").length,
    rejected: requests.filter((r) => r.requestStatus === "rejected").length,
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader title="포인트 충전 신청 관리" />

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "전체", value: counts.total, color: "text-sam-fg" },
          { label: "입금확인대기", value: counts.waiting, color: "text-amber-700" },
          { label: "대기중", value: counts.pending, color: "text-blue-700" },
          { label: "승인완료", value: counts.approved, color: "text-emerald-700" },
          { label: "반려", value: counts.rejected, color: "text-red-600" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 text-center shadow-sm"
          >
            <p className={`sam-text-hero font-bold ${color}`}>{value}</p>
            <p className="sam-text-xxs text-sam-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* 입금확인대기 강조 안내 */}
      {counts.waiting > 0 && (
        <div className="flex items-center gap-2 rounded-ui-rect border border-amber-300 bg-amber-50 px-4 py-3 sam-text-body-secondary text-amber-900">
          <span className="sam-text-body-lg">⚠️</span>
          <span>
            입금 확인이 필요한 신청 <strong>{counts.waiting}건</strong>이 있습니다.
            아래 목록에서 입금 확인 후 승인해 주세요.
          </span>
        </div>
      )}

      <AdminPointChargeFilterBar filters={filters} onChange={setFilters} />

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface shadow-sm">
        <div className="border-b border-sam-border-soft px-4 py-3">
          <h2 className="sam-text-body font-semibold text-sam-fg">
            충전 신청 목록 ({filtered.length}건)
          </h2>
        </div>
        <div className="p-4">
          <AdminPointChargeInlineActions requests={filtered} />
        </div>
      </div>
    </div>
  );
}
