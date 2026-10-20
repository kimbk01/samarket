"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsDocumentFilterBar, type OpsDocumentFilterState } from "./OpsDocumentFilterBar";
import { OpsDocumentTable } from "./OpsDocumentTable";
import { OpsDocumentSummaryCards } from "./OpsDocumentSummaryCards";
import { loadOpsDocsFromServer } from "@/lib/ops-docs/ops-docs-sync-client";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";

const INIT_FILTER: OpsDocumentFilterState = {
  search: "",
  docType: "",
  status: "",
  category: "",
  sort: "updated",
};

export function AdminOpsDocsPage() {
  const { t } = useI18n();
  const [filterState, setFilterState] = useState<OpsDocumentFilterState>(INIT_FILTER);
  const [activeTab, setActiveTab] = useState<"list" | "summary">("list");
  const [refresh, setRefresh] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadOpsDocsFromServer().then(() => setHydrated(true));
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_menu_manage_docs" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">{t("admin_rec_mon_loading_settings")}</p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_menu_manage_docs" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <AdminActionLink href="/admin/ops-docs/create" variant="primary">
          {t("admin_ops_doc_create")}
        </AdminActionLink>
        <AdminActionButton
          variant="secondary"
          onClick={() => setActiveTab(activeTab === "list" ? "summary" : "list")}
        >
          {activeTab === "list" ? t("admin_ops_doc_view_summary") : t("admin_ops_doc_view_list")}
        </AdminActionButton>
      </div>
      {activeTab === "summary" ? (
        <AdminCard titleKey="admin_ops_doc_card_summary">
          <OpsDocumentSummaryCards />
        </AdminCard>
      ) : (
        <>
          <div className="mb-4">
            <OpsDocumentFilterBar state={filterState} onChange={setFilterState} />
          </div>
          <AdminCard titleKey="admin_ops_doc_card_list">
            <OpsDocumentTable filterState={filterState} refresh={refresh} />
          </AdminCard>
        </>
      )}
    </>
  );
}
