"use client";

import { useState } from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OpsDocumentFilterBar, type OpsDocumentFilterState } from "./OpsDocumentFilterBar";
import { OpsDocumentTable } from "./OpsDocumentTable";
import { OpsDocumentSummaryCards } from "./OpsDocumentSummaryCards";

const INIT_FILTER: OpsDocumentFilterState = {
  search: "",
  docType: "",
  status: "",
  category: "",
  sort: "updated",
};

export function AdminOpsDocsPage() {
  const [filterState, setFilterState] = useState<OpsDocumentFilterState>(INIT_FILTER);
  const [activeTab, setActiveTab] = useState<"list" | "summary">("list");
  const [refresh, setRefresh] = useState(0);

  return (
    <>
      <AdminPageHeader title="운영 문서 (SOP / 플레이북 / 시나리오)" />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href="/admin/ops-docs/create"
          className="rounded border border-signature bg-signature px-3 py-2 sam-text-body font-medium text-white"
        >
          문서 생성
        </Link>
        <button
          type="button"
          onClick={() => setActiveTab(activeTab === "list" ? "summary" : "list")}
          className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body text-sam-fg"
        >
          {activeTab === "list" ? "요약 보기" : "목록 보기"}
        </button>
      </div>
      {activeTab === "summary" ? (
        <AdminCard title="문서 요약">
          <OpsDocumentSummaryCards />
        </AdminCard>
      ) : (
        <>
          <div className="mb-4">
            <OpsDocumentFilterBar state={filterState} onChange={setFilterState} />
          </div>
          <AdminCard title="문서 목록">
            <OpsDocumentTable filterState={filterState} refresh={refresh} />
          </AdminCard>
        </>
      )}
    </>
  );
}
