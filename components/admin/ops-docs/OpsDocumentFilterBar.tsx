"use client";

import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OpsDocType, OpsDocStatus, OpsDocCategory } from "@/lib/types/ops-docs";
import type { MessageKey } from "@/lib/i18n/messages";

export interface OpsDocumentFilterState {
  search: string;
  docType: OpsDocType | "";
  status: OpsDocStatus | "";
  category: string;
  sort: "updated" | "title" | "status";
}

interface OpsDocumentFilterBarProps {
  state: OpsDocumentFilterState;
  onChange: (state: OpsDocumentFilterState) => void;
}

export function OpsDocumentFilterBar({ state, onChange }: OpsDocumentFilterBarProps) {
  const { t } = useI18n();

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
    <div className="flex flex-wrap items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
      <input
        type="search"
        placeholder={t("admin_ops_doc_search_ph")}
        value={state.search}
        onChange={(e) => onChange({ ...state, search: e.target.value })}
        className="min-w-[160px] rounded border border-sam-border px-3 py-2 sam-text-body"
      />
      <select
        value={state.docType}
        onChange={(e) => onChange({ ...state, docType: e.target.value as OpsDocType | "" })}
        className="rounded border border-sam-border px-3 py-2 sam-text-body"
      >
        {docTypeOptions.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </select>
      <select
        value={state.status}
        onChange={(e) => onChange({ ...state, status: e.target.value as OpsDocStatus | "" })}
        className="rounded border border-sam-border px-3 py-2 sam-text-body"
      >
        {statusOptions.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </select>
      <select
        value={state.category}
        onChange={(e) => onChange({ ...state, category: e.target.value })}
        className="rounded border border-sam-border px-3 py-2 sam-text-body"
      >
        {categoryOptions.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </select>
      <select
        value={state.sort}
        onChange={(e) =>
          onChange({ ...state, sort: e.target.value as OpsDocumentFilterState["sort"] })
        }
        className="rounded border border-sam-border px-3 py-2 sam-text-body"
      >
        {sortOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {t(o.labelKey)}
          </option>
        ))}
      </select>
    </div>
  );
}
