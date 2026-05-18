"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { PerformanceSummaryCards } from "./PerformanceSummaryCards";
import { SlowApiTable } from "./SlowApiTable";
import { SlowQueryTable } from "./SlowQueryTable";

export function AdminPerformancePage() {
  const { t } = useI18n();
  return (
    <>
      <AdminPageHeader titleKey="admin_performance_kd0b3c807" />
      <div className="space-y-4">
        <AdminCard titleKey="admin_performance_status_3">
          <PerformanceSummaryCards />
        </AdminCard>
        <AdminCard titleKey="admin_performance_ke743d657">
          <SlowApiTable />
        </AdminCard>
        <AdminCard titleKey="admin_performance_kdcf01eac">
          <SlowQueryTable />
        </AdminCard>
      </div>
    </>
  );
}
