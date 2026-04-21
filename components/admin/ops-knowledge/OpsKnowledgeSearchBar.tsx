"use client";

import type {
  OpsKnowledgeDocType,
  OpsKnowledgeCategory,
} from "@/lib/types/ops-knowledge";
import type { OpsKnowledgeSearchFilters } from "@/lib/ops-knowledge/ops-knowledge-utils";

const DOC_TYPE_OPTIONS: { value: OpsKnowledgeDocType | ""; label: string }[] = [
  { value: "", label: "전체 유형" },
  { value: "sop", label: "SOP" },
  { value: "playbook", label: "플레이북" },
  { value: "scenario", label: "시나리오" },
];

const CATEGORY_OPTIONS: { value: OpsKnowledgeCategory | ""; label: string }[] = [
  { value: "", label: "전체 카테고리" },
  { value: "incident_response", label: "인시던트 대응" },
  { value: "deployment", label: "배포" },
  { value: "rollback", label: "롤백" },
  { value: "moderation", label: "검수" },
  { value: "recommendation", label: "추천" },
  { value: "ads", label: "광고" },
  { value: "points", label: "포인트" },
  { value: "support", label: "지원" },
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
  return (
    <div className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="제목·요약·태그 검색 (자동완성 placeholder)"
          className="min-w-[240px] flex-1 rounded border border-sam-border px-3 py-2 sam-text-body"
        />
        <button
          type="button"
          onClick={onSearch}
          className="rounded border border-signature bg-signature px-4 py-2 sam-text-body font-medium text-white"
        >
          검색
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
            <option key={o.value} value={o.value}>{o.label}</option>
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
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
