"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { UsageCostCards } from "./UsageCostCards";
import { loadUsageOpsFromServer } from "@/lib/usage/usage-ops-sync-client";

export function AdminUsagePage() {
  const { t } = useI18n();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadUsageOpsFromServer().then(() => setHydrated(true));
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_page_usage_optimization" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">{t("admin_rec_mon_loading_settings")}</p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_page_usage_optimization" />
      <AdminCard titleKey="admin_usage_card_title">
        <UsageCostCards />
      </AdminCard>
    </>
  );
}
