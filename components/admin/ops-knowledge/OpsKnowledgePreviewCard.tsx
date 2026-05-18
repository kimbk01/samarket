"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OPS_DOC_TYPE_KEYS } from "@/components/admin/i18n/admin-ops-doc-label-keys";
import {
  OPS_TOOLS_KB_CATEGORY_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import Link from "next/link";
import type { OpsKnowledgeBaseIndexItem } from "@/lib/types/ops-knowledge";

interface OpsKnowledgePreviewCardProps {
  item: OpsKnowledgeBaseIndexItem;
  onView?: (documentId: string) => void;
}

export function OpsKnowledgePreviewCard({ item, onView }: OpsKnowledgePreviewCardProps) {
  const { t } = useI18n();
  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex flex-wrap items-center gap-2 sam-text-helper text-sam-muted">
        <span>{t(OPS_DOC_TYPE_KEYS[item.docType])}</span>
        <span>{t(opsToolsLabel(OPS_TOOLS_KB_CATEGORY_KEYS, item.category))}</span>
        {item.isPinned && <span>{t("admin_ops_tools_kb_pinned")}</span>}
      </div>
      <h3 className="mt-2 font-medium text-sam-fg">
        <Link
          href={`/admin/ops-docs/${item.documentId}`}
          className="text-signature hover:underline"
          onClick={() => onView?.(item.documentId)}
        >
          {item.title}
        </Link>
      </h3>
      <p className="mt-2 line-clamp-3 sam-text-body-secondary text-sam-muted">{item.summary}</p>
      {item.tags.length > 0 && (
        <p className="mt-2 sam-text-helper text-sam-muted">
          {item.tags.join(", ")}
        </p>
      )}
      <p className="mt-2 sam-text-helper text-sam-meta">
        수정 {new Date(item.updatedAt).toLocaleDateString("ko-KR")}
      </p>
    </div>
  );
}
