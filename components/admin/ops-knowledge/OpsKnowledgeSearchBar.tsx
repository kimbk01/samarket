"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { OPS_DOC_TYPE_KEYS } from "@/components/admin/i18n/admin-ops-doc-label-keys";
import type {
  OpsKnowledgeDocType,
  OpsKnowledgeCategory,
} from "@/lib/types/ops-knowledge";
import type { OpsKnowledgeSearchFilters } from "@/lib/ops-knowledge/ops-knowledge-utils";

const DOC_TYPE_OPTIONS: { value: OpsKnowledgeDocType | ""; labelKey: MessageKey }[] = [
  { value: "", labelKey: "admin_ops_tools_kb_filter_all_type" },
  { value: "sop", labelKey: OPS_DOC_TYPE_KEYS.sop },
  { value: "playbook", labelKey: OPS_DOC_TYPE_KEYS.playbook },
  { value: "scenario", labelKey: OPS_DOC_TYPE_KEYS.scenario },
];

const CATEGORY_OPTIONS: { value: OpsKnowledgeCategory | ""; labelKey: MessageKey }[] = [
  { value: "", labelKey: "admin_ops_tools_kb_filter_all_category" },
  { value: "incident_response", labelKey: "admin_ops_doc_cat_incident" },
  { value: "deployment", labelKey: "admin_ops_tools_kb_cat_deployment" },
  { value: "rollback", labelKey: "admin_ops_tools_kb_cat_rollback" },
  { value: "moderation", labelKey: "admin_ops_doc_cat_moderation" },
  { value: "recommendation", labelKey: "admin_ops_tools_kb_cat_recommendation" },
  { value: "ads", labelKey: "admin_ops_doc_cat_ads" },
  { value: "points", labelKey: "admin_ops_doc_cat_points" },
  { value: "support", labelKey: "admin_ops_doc_cat_support" },
];

interface OpsKnowledgeSearchBarProps {
  query: string;
  filters: OpsKnowledgeSearchFilters;
  onQueryChange: (query: string) => void;
  onFiltersChange: (filters: OpsKnowledgeSearchFilters) => void;
  onSearch: () => void;
}

export function OpsKnowledgeSearchBar({
  query,
  filters,
  onQueryChange,
  onFiltersChange,
  onSearch,
}: OpsKnowledgeSearchBarProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder={t("admin_ops_tools_kb_search_ph")}
          className="min-w-[240px] flex-1 rounded border border-sam-border px-3 py-2 sam-text-body"
        />
        <button
          type="button"
          onClick={onSearch}
          className="rounded border border-signature bg-signature px-4 py-2 sam-text-body font-medium text-white"
        >
          {t("admin_ops_tools_kb_search_btn")}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          value={filters.docType ?? ""}
          onChange={(e) =>
            onFiltersChange({ ...filters, docType: (e.target.value || undefined) as OpsKnowledgeDocType | undefined })
          }
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {DOC_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
        <select
          value={filters.category ?? ""}
          onChange={(e) =>
            onFiltersChange({ ...filters, category: (e.target.value || undefined) as OpsKnowledgeCategory | undefined })
          }
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
