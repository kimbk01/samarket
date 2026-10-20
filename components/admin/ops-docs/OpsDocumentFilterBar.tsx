"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OpsDocType, OpsDocStatus } from "@/lib/types/ops-docs";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";
import type { AdminListQueryConfig, AdminListQueryState } from "@/lib/admin/list-query/admin-list-query";
import type { UseAdminListQueryResult } from "@/lib/admin/list-query/use-admin-list-query";

export interface OpsDocumentFilterState {
  search: string;
  docType: OpsDocType | "";
  status: OpsDocStatus | "";
  category: string;
  sort: "updated" | "title" | "status";
}

/** 주소 키: `q`(검색어) · `status` · `doc_type` · `category` · `sort` (R7 — 새로고침·링크 공유·상세 복귀 시 유지). */
export const OPS_DOC_LIST_QUERY_CONFIG = {
  statuses: ["active", "draft", "archived"],
  sorts: ["updated", "title", "status"],
  defaults: { sort: "updated" },
  extras: ["doc_type", "category", "view"],
} as const satisfies AdminListQueryConfig<"doc_type" | "category" | "view">;

export function opsDocumentFilterStateFromQuery(
  query: AdminListQueryState<"doc_type" | "category" | "view">
): OpsDocumentFilterState {
  const sort = query.sort === "title" || query.sort === "status" ? query.sort : "updated";
  return {
    search: query.q,
    docType: (["sop", "playbook", "scenario"].includes(query.extras.doc_type) ? query.extras.doc_type : "") as OpsDocType | "",
    status: query.status as OpsDocStatus | "",
    category: query.extras.category,
    sort,
  };
}

interface OpsDocumentFilterBarProps {
  lq: UseAdminListQueryResult<"doc_type" | "category" | "view">;
}

export function OpsDocumentFilterBar({ lq }: OpsDocumentFilterBarProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";

  const docTypeOptions = useMemo(
    () =>
      [
        { value: "" as const, labelKey: "admin_ops_doc_filter_all_type" as MessageKey },
        { value: "sop" as const, labelKey: "admin_ops_doc_type_sop" as MessageKey },
        { value: "playbook" as const, labelKey: "admin_ops_doc_type_playbook" as MessageKey },
        { value: "scenario" as const, labelKey: "admin_ops_doc_type_scenario" as MessageKey },
      ] satisfies { value: OpsDocType | ""; labelKey: MessageKey }[],
    []
  );

  const statusOptions = useMemo(
    () =>
      [
        { value: "" as const, labelKey: "admin_ops_doc_filter_all_status" as MessageKey },
        { value: "active" as const, labelKey: "admin_ops_doc_status_active" as MessageKey },
        { value: "draft" as const, labelKey: "admin_ops_doc_status_draft" as MessageKey },
        { value: "archived" as const, labelKey: "admin_ops_doc_status_archived" as MessageKey },
      ] satisfies { value: OpsDocStatus | ""; labelKey: MessageKey }[],
    []
  );

  const categoryOptions = useMemo(
    () =>
      [
        { value: "", labelKey: "admin_ops_doc_filter_all_category" as MessageKey },
        { value: "incident_response", labelKey: "admin_ops_doc_cat_incident" as MessageKey },
        { value: "deployment", labelKey: "admin_ops_doc_cat_deployment" as MessageKey },
        { value: "rollback", labelKey: "admin_ops_doc_cat_rollback" as MessageKey },
        { value: "moderation", labelKey: "admin_ops_doc_cat_moderation" as MessageKey },
        { value: "recommendation", labelKey: "admin_ops_doc_cat_recommendation" as MessageKey },
        { value: "ads", labelKey: "admin_ops_doc_cat_ads" as MessageKey },
        { value: "points", labelKey: "admin_ops_doc_cat_points" as MessageKey },
        { value: "support", labelKey: "admin_ops_doc_cat_support" as MessageKey },
      ] satisfies { value: string; labelKey: MessageKey }[],
    []
  );

  const sortOptions = useMemo(
    () =>
      [
        { value: "updated" as const, labelKey: "admin_ops_doc_sort_updated" as MessageKey },
        { value: "title" as const, labelKey: "admin_ops_doc_sort_title" as MessageKey },
        { value: "status" as const, labelKey: "admin_ops_doc_sort_status" as MessageKey },
      ] satisfies { value: OpsDocumentFilterState["sort"]; labelKey: MessageKey }[],
    []
  );

  return (
    <AdminFilterBar
      ko={ko}
      draft={lq.draft}
      onDraftChange={lq.setDraft}
      onSubmit={lq.submit}
      onReset={lq.reset}
      showPeriod={false}
      searchPlaceholder={t("admin_ops_doc_search_ph")}
      status={{
        value: lq.query.status,
        onChange: lq.setStatus,
        options: statusOptions.map((o) => ({ value: o.value, label: t(o.labelKey) })),
      }}
    >
      <AdminFilterSelect ko={ko} label={t("admin_ops_doc_th_type")} name="doc_type" value={lq.query.extras.doc_type} onChange={(v) => lq.setExtra("doc_type", v)}>
        {docTypeOptions.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </AdminFilterSelect>
      <AdminFilterSelect ko={ko} label={t("admin_ops_doc_th_category")} name="category" value={lq.query.extras.category} onChange={(v) => lq.setExtra("category", v)}>
        {categoryOptions.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </AdminFilterSelect>
      <AdminFilterSelect ko={ko} label={ko ? "정렬" : "Sort"} name="sort" value={lq.query.sort} onChange={lq.setSort}>
        {sortOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </AdminFilterSelect>
    </AdminFilterBar>
  );
}
