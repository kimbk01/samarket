"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { OpsDocumentFilterState } from "./OpsDocumentFilterBar";
import { getOpsDocuments } from "@/lib/ops-docs/mock-ops-documents";

const DOC_TYPE_LABELS: Record<string, string> = {
  sop: "SOP",
  playbook: "플레이북",
  scenario: "시나리오",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "초안",
  active: "활성",
  archived: "보관",
};

const CATEGORY_LABELS: Record<string, string> = {
  incident_response: "인시던트",
  deployment: "배포",
  rollback: "롤백",
  moderation: "검수",
  recommendation: "추천",
  ads: "광고",
  points: "포인트",
  support: "지원",
};

interface OpsDocumentTableProps {
  filterState: OpsDocumentFilterState;
  refresh?: number;
}

export function OpsDocumentTable({ filterState, refresh = 0 }: OpsDocumentTableProps) {
  const documents = useMemo(
    () =>
      getOpsDocuments({
    docType: filterState.docType || undefined,
    status: filterState.status || undefined,
    category: filterState.category || undefined,
    search: filterState.search.trim() || undefined,
    sort: filterState.sort,
      }),
    [filterState.search, filterState.docType, filterState.status, filterState.category, filterState.sort, refresh]
  );

  if (documents.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-[14px] text-gray-500">
        조건에 맞는 문서가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">제목</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">유형</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">카테고리</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">상태</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">수정일</th>
            <th className="px-3 py-2.5 text-left font-medium text-gray-700">작성자</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((d) => (
            <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/ops-docs/${d.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {d.isPinned && "📌 "}
                  {d.title}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {DOC_TYPE_LABELS[d.docType]}
              </td>
              <td className="px-3 py-2.5 text-gray-700">
                {CATEGORY_LABELS[d.category] ?? d.category}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 text-[12px] ${
                    d.status === "active"
                      ? "bg-emerald-50 text-emerald-800"
                      : d.status === "draft"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {STATUS_LABELS[d.status]}
                </span>
              </td>
              <td className="px-3 py-2.5 text-gray-600">
                {new Date(d.updatedAt).toLocaleDateString("ko-KR")}
              </td>
              <td className="px-3 py-2.5 text-gray-600">
                {d.createdByAdminNickname}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
