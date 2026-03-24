"use client";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { UsageCostCards } from "./UsageCostCards";

export function AdminUsagePage() {
  return (
    <>
      <AdminPageHeader title="비용 최적화" />
      <AdminCard title="Supabase 사용량 및 월간 비용 추정">
        <UsageCostCards />
      </AdminCard>
    </>
  );
}
