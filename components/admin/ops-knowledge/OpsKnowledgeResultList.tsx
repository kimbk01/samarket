"use client";

import Link from "next/link";
import type { OpsKnowledgeBaseIndexItem } from "@/lib/types/ops-knowledge";
import { OpsKnowledgePreviewCard } from "./OpsKnowledgePreviewCard";

const DOC_TYPE_LABELS: Record<string, string> = {
  sop: "SOP",
  playbook: "플레이북",
  scenario: "시나리오",
};

interface OpsKnowledgeResultListProps {
  items: OpsKnowledgeBaseIndexItem[];
  selectedDocumentId: string | null;
  onSelectDocument: (documentId: string | null) => void;
  onViewDocument?: (documentId: string) => void;
}

export function OpsKnowledgeResultList({
  items,
  selectedDocumentId,
  onSelectDocument,
  onViewDocument,
}: OpsKnowledgeResultListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
        검색 결과가 없습니다.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.id}>
          <div
            className={`cursor-pointer rounded-ui-rect border p-3 ${
              selectedDocumentId === item.documentId
                ? "border-signature bg-signature/5"
                : "border-sam-border bg-sam-surface hover:bg-sam-app"
            }`}
            onClick={() => onSelectDocument(item.documentId)}
            onKeyDown={(e) => e.key === "Enter" && onSelectDocument(item.documentId)}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center gap-2 text-[12px] text-sam-muted">
              <span>{DOC_TYPE_LABELS[item.docType]}</span>
              {item.isPinned && <span>📌</span>}
            </div>
            <Link
              href={`/admin/ops-docs/${item.documentId}`}
              className="mt-1 block font-medium text-sam-fg hover:text-signature hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                onViewDocument?.(item.documentId);
              }}
            >
              {item.title}
            </Link>
            <p className="mt-1 line-clamp-2 text-[13px] text-sam-muted">{item.summary}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
