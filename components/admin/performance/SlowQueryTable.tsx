"use client";

/**
 * 느린 쿼리 감지 기록 — 서버 페이지 (`GET /api/admin/performance-ops?part=slow-queries`, R7).
 * 전체를 한 번에 그리던 목록 대체 — 쪽·크기(20/50/100)는 주소에 보존, 「총 N건」.
 */

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { SlowQuery } from "@/lib/types/performance";
import { AdminTable } from "@/components/admin/AdminTable";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminServerListFrame } from "@/components/admin/sync-list/AdminServerListFrame";
import { useAdminServerPage } from "@/components/admin/sync-list/useAdminServerPage";

export function SlowQueryTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const lq = useAdminListQuery();
  const page = useAdminServerPage<SlowQuery>(`/api/admin/performance-ops?part=slow-queries&${lq.apiQueryString}`, lq.refreshKey);

  return (
    <div className="space-y-4">
      <p className="sam-text-helper text-sam-muted">{t("admin_performance_k7f4664cc")}</p>
      <AdminServerListFrame
        ko={ko}
        state={page}
        page={lq.query.page}
        size={lq.query.size}
        onPageChange={lq.setPage}
        onSizeChange={lq.setSize}
        onRetry={lq.refresh}
        emptyMessage="느린 쿼리가 없습니다."
      >
        {(queries) => (
          <AdminTable headers={["쿼리명", "소요(ms)", "라우트", "감지 시각"]}>
            {queries.map((q) => (
              <tr key={q.id} className="border-b border-sam-border-soft">
                <td className="px-3 py-2.5 font-medium text-sam-fg">{q.queryName}</td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">{q.duration}</td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">{q.route}</td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {formatAdminManilaDateTime(q.detectedAt)}
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminServerListFrame>
    </div>
  );
}
