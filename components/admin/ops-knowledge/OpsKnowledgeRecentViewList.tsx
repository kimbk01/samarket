"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_KB_SOURCE_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo } from "react";
import Link from "next/link";
import { getOpsKnowledgeRecentViews } from "@/lib/ops-knowledge/ops-knowledge-state";
import { getOpsDocumentById } from "@/lib/ops-docs/ops-docs-state";

export function OpsKnowledgeRecentViewList() {
  const { t } = useI18n();
  const views = useMemo(
    () => getOpsKnowledgeRecentViews({ adminId: "admin1", limit: 15 }),
    []
  );

  if (views.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_kb_recent_empty")}</div>
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
              className="min-w-0 flex-1 sam-text-body text-signature hover:underline"
            >
              {doc?.title ?? v.documentId}
            </Link>
            <span className="shrink-0 sam-text-helper text-sam-muted">
              {t(opsToolsLabel(OPS_TOOLS_KB_SOURCE_KEYS, v.sourceType))} · {new Date(v.viewedAt).toLocaleString("ko-KR")}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
