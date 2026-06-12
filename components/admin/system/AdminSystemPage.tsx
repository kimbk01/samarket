"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OperationStatusCards } from "./OperationStatusCards";
import { SystemHealthList } from "./SystemHealthList";
import type { MessageKey } from "@/lib/i18n/messages";
import { loadSystemOpsFromServer } from "@/lib/system/system-ops-sync-client";

type TabId = "overview" | "services";

export function AdminSystemPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadSystemOpsFromServer().then(() => setHydrated(true));
  }, []);

  const tabs = useMemo(
    (): { id: TabId; labelKey: MessageKey }[] => [
      { id: "overview", labelKey: "admin_system_tab_overview" },
      { id: "services", labelKey: "admin_system_tab_services" },
    ],
    []
  );

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_page_system_stability" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">{t("admin_rec_mon_loading_settings")}</p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_page_system_stability" />
      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 sam-text-body font-medium ${
              activeTab === tab.id
                ? "border-signature text-signature"
                : "border-transparent text-sam-muted hover:text-sam-fg"
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>
      {activeTab === "overview" && (
        <AdminCard titleKey="admin_system_card_overview">
          <OperationStatusCards />
        </AdminCard>
      )}
      {activeTab === "services" && (
        <AdminCard titleKey="admin_system_card_services">
          <SystemHealthList />
        </AdminCard>
      )}
    </>
  );
}
