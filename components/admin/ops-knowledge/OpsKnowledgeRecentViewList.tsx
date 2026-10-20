"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_KB_SOURCE_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import Link from "next/link";
import type { OpsKnowledgeRecentView } from "@/lib/types/ops-knowledge";
import { getOpsDocumentById } from "@/lib/ops-docs/ops-docs-state";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminServerListFrame } from "@/components/admin/sync-list/AdminServerListFrame";
import { useAdminServerPage } from "@/components/admin/sync-list/useAdminServerPage";
export function OpsKnowledgeRecentViewList() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 열람 기록 = 서버 페이지 (`GET /api/admin/ops-knowledge?part=recent-views`, R7) — 고정 상한(15건) 없음. */
  const lq = useAdminListQuery();
  const page = useAdminServerPage<OpsKnowledgeRecentView>(
    `/api/admin/ops-knowledge?part=recent-views&admin_id=admin1&${lq.apiQueryString}`,
    lq.refreshKey
  );

  return (
    <AdminServerListFrame
      ko={ko}
      state={page}
      page={lq.query.page}
      size={lq.query.size}
      onPageChange={lq.setPage}
      onSizeChange={lq.setSize}
      onRetry={lq.refresh}
      emptyMessage={t("admin_ops_tools_kb_recent_empty")}
    >
      {(views) => (
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
      )}
    </AdminServerListFrame>
  );
}
