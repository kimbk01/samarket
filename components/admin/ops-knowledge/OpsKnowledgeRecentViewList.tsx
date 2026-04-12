"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getOpsKnowledgeRecentViews } from "@/lib/ops-knowledge/mock-ops-knowledge-recent-views";
import { getOpsDocumentById } from "@/lib/ops-docs/mock-ops-documents";

const SOURCE_LABELS: Record<string, string> = {
  search: "검색",
  incident: "이슈",
  runbook: "런북",
  manual: "직접",
};

export function OpsKnowledgeRecentViewList() {
  const views = useMemo(
    () => getOpsKnowledgeRecentViews({ adminId: "admin1", limit: 15 }),
    []
  );

  if (views.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center text-[14px] text-sam-muted">
        최근 열람 문서가 없습니다.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {views.map((v) => {
        const doc = getOpsDocumentById(v.documentId);
        return (
          <li key={v.id} className="flex items-center justify-between gap-2 rounded border border-sam-border-soft bg-sam-surface px-3 py-2">
            <Link
              href={`/admin/ops-docs/${v.documentId}`}
              className="min-w-0 flex-1 text-[14px] text-signature hover:underline"
            >
              {doc?.title ?? v.documentId}
            </Link>
            <span className="shrink-0 text-[12px] text-sam-muted">
              {SOURCE_LABELS[v.sourceType]} · {new Date(v.viewedAt).toLocaleString("ko-KR")}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
