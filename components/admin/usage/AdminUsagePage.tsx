"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminCard } from "@/components/admin/AdminCard";
import { UsageCostCards } from "./UsageCostCards";
import { loadUsageOpsFromServer } from "@/lib/usage/usage-ops-sync-client";

export function AdminUsagePage() {
  const { t, language } = useI18n();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadUsageOpsFromServer().then(() => setHydrated(true));
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_dev_usage" />
        <AdminLoadingState ko={language === "ko"} label={t("admin_rec_mon_loading_settings")} />
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_dev_usage" />
      <AdminCard titleKey="admin_usage_card_title">
        <UsageCostCards />
      </AdminCard>
    </>
  );
}
