"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OPS_DOC_TYPE_KEYS } from "@/components/admin/i18n/admin-ops-doc-label-keys";
import Link from "next/link";
import type { OpsKnowledgeBaseIndexItem } from "@/lib/types/ops-knowledge";
import { OpsKnowledgePreviewCard } from "./OpsKnowledgePreviewCard";

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
  const { t } = useI18n();
  if (items.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_kb_results_empty")}</div>
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
            <div className="flex items-center gap-2 sam-text-helper text-sam-muted">
              <span>{t(OPS_DOC_TYPE_KEYS[item.docType])}</span>
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
            <p className="mt-1 line-clamp-2 sam-text-body-secondary text-sam-muted">{item.summary}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
