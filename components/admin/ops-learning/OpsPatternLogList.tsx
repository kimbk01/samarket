"use client";

/**
 * 패턴 처리 로그 — 서버 페이지 (`GET /api/admin/ops-learning?part=pattern-logs&pattern_id=`, R7).
 * 고정 상한(30건) 없이 쪽으로 넘긴다. 쪽·크기는 주소에 보존.
 */

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_PATTERN_LOG_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import type { OpsPatternLog } from "@/lib/types/ops-learning";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminServerListFrame } from "@/components/admin/sync-list/AdminServerListFrame";
import { useAdminServerPage } from "@/components/admin/sync-list/useAdminServerPage";

interface OpsPatternLogListProps {
  patternId: string;
}

export function OpsPatternLogList({ patternId }: OpsPatternLogListProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const lq = useAdminListQuery();
  const page = useAdminServerPage<OpsPatternLog>(
    `/api/admin/ops-learning?part=pattern-logs&pattern_id=${encodeURIComponent(patternId)}&${lq.apiQueryString}`,
    lq.refreshKey
  );

  return (
    <div>
      <p className="sam-text-helper font-medium text-sam-fg">{t("admin_ops_tools_learning_tab_logs")}</p>
      <div className="mt-2">
        <AdminServerListFrame
          ko={ko}
          state={page}
          page={lq.query.page}
          size={lq.query.size}
          onPageChange={lq.setPage}
          onSizeChange={lq.setSize}
          onRetry={lq.refresh}
          emptyMessage={t("admin_ops_tools_learning_logs_empty")}
        >
          {(logs) => (
            <ul className="space-y-1">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="flex flex-wrap items-center gap-2 rounded border border-sam-border-soft bg-sam-surface px-2 py-1.5 sam-text-body-secondary"
                >
                  <span className="rounded bg-sam-surface-muted px-1.5 py-0.5 font-medium text-sam-fg">
                    {t(opsToolsLabel(OPS_TOOLS_PATTERN_LOG_KEYS, log.actionType))}
                  </span>
                  <span className="text-sam-muted">{log.actorNickname}</span>
                  {log.note && <span className="text-sam-muted">· {log.note}</span>}
                  <span className="ml-auto text-sam-meta">{formatAdminManilaDateTime(log.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </AdminServerListFrame>
      </div>
    </div>
  );
}
