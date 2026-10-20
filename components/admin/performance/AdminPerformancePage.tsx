"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { PerformanceSummaryCards } from "./PerformanceSummaryCards";
import { SlowApiTable } from "./SlowApiTable";
import { SlowQueryTable } from "./SlowQueryTable";
import { loadPerformanceOpsFromServer } from "@/lib/performance/performance-ops-sync-client";

export function AdminPerformancePage() {
  const { t } = useI18n();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadPerformanceOpsFromServer().then(() => setHydrated(true));
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_performance" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">{t("admin_rec_mon_loading_settings")}</p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_performance" />
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
