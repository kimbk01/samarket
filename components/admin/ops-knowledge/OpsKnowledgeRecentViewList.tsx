"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_KB_SOURCE_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo } from "react";
import Link from "next/link";
import { getOpsKnowledgeRecentViews } from "@/lib/ops-knowledge/ops-knowledge-state";
import { getOpsDocumentById } from "@/lib/ops-docs/ops-docs-state";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
export function OpsKnowledgeRecentViewList() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const views = useMemo(
    () => getOpsKnowledgeRecentViews({ adminId: "admin1", limit: 15 }),
    []
  );

  if (views.length === 0) {
    return (
      <AdminEmptyState ko={ko} message={t("admin_ops_tools_kb_recent_empty")} />
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
              {t(opsToolsLabel(OPS_TOOLS_KB_SOURCE_KEYS, v.sourceType))} · {formatAdminManilaDateTime(v.viewedAt)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
