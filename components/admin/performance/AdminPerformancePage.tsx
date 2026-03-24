"use client";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { PerformanceSummaryCards } from "./PerformanceSummaryCards";
import { SlowApiTable } from "./SlowApiTable";
import { SlowQueryTable } from "./SlowQueryTable";

export function AdminPerformancePage() {
  return (
    <>
      <AdminPageHeader title="성능 최적화" />
      <div className="space-y-4">
        <AdminCard title="평균 로딩·API·DB 시간 및 성능 상태">
          <PerformanceSummaryCards />
        </AdminCard>
        <AdminCard title="느린 API 리스트">
          <SlowApiTable />
        </AdminCard>
        <AdminCard title="쿼리 병목 리스트">
          <SlowQueryTable />
        </AdminCard>
      </div>
    </>
  );
}
