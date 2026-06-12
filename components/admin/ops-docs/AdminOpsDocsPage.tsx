"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsDocumentFilterBar, type OpsDocumentFilterState } from "./OpsDocumentFilterBar";
import { OpsDocumentTable } from "./OpsDocumentTable";
import { OpsDocumentSummaryCards } from "./OpsDocumentSummaryCards";
import { loadOpsDocsFromServer } from "@/lib/ops-docs/ops-docs-sync-client";

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
        <AdminPageHeader titleKey="admin_ops_doc_page_title" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">{t("admin_rec_mon_loading_settings")}</p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_ops_doc_page_title" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href="/admin/ops-docs/create"
          className="rounded border border-signature bg-signature px-3 py-2 sam-text-body font-medium text-white"
        >
          {t("admin_ops_doc_create")}
        </Link>
        <button
          type="button"
          onClick={() => setActiveTab(activeTab === "list" ? "summary" : "list")}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
        >
          {activeTab === "list" ? t("admin_ops_doc_view_summary") : t("admin_ops_doc_view_list")}
        </button>
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
