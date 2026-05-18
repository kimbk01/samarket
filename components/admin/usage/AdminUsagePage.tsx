"use client";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { UsageCostCards } from "./UsageCostCards";

export function AdminUsagePage() {
  return (
    <>
      <AdminPageHeader titleKey="admin_page_usage_optimization" />
      <AdminCard titleKey="admin_usage_card_title">
        <UsageCostCards />
      </AdminCard>
    </>
  );
}
