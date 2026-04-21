"use client";

import type { OpsDocType, OpsDocStatus } from "@/lib/types/ops-docs";

const DOC_TYPE_OPTIONS: { value: OpsDocType | ""; label: string }[] = [
  { value: "", label: "전체 유형" },
  { value: "sop", label: "SOP" },
  { value: "playbook", label: "플레이북" },
  { value: "scenario", label: "시나리오" },
];

const STATUS_OPTIONS: { value: OpsDocStatus | ""; label: string }[] = [
  { value: "", label: "전체 상태" },
  { value: "active", label: "활성" },
  { value: "draft", label: "초안" },
  { value: "archived", label: "보관" },
];

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
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

const SORT_OPTIONS: { value: "updated" | "title" | "status"; label: string }[] = [
  { value: "updated", label: "최근 수정순" },
  { value: "title", label: "제목순" },
  { value: "status", label: "상태순" },
];

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
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
      <input
        type="search"
        placeholder="제목·요약·태그 검색"
        value={state.search}
        onChange={(e) => onChange({ ...state, search: e.target.value })}
        className="min-w-[160px] rounded border border-sam-border px-3 py-2 sam-text-body"
      />
      <select
        value={state.docType}
        onChange={(e) => onChange({ ...state, docType: e.target.value as OpsDocType | "" })}
        className="rounded border border-sam-border px-3 py-2 sam-text-body"
      >
        {DOC_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select
        value={state.status}
        onChange={(e) => onChange({ ...state, status: e.target.value as OpsDocStatus | "" })}
        className="rounded border border-sam-border px-3 py-2 sam-text-body"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select
        value={state.category}
        onChange={(e) => onChange({ ...state, category: e.target.value })}
        className="rounded border border-sam-border px-3 py-2 sam-text-body"
      >
        {CATEGORY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <select
        value={state.sort}
        onChange={(e) => onChange({ ...state, sort: e.target.value as "updated" | "title" | "status" })}
        className="rounded border border-sam-border px-3 py-2 sam-text-body"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
