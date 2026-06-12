"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getSlowQueries } from "@/lib/performance/performance-state";
import { AdminTable } from "@/components/admin/AdminTable";

export function SlowQueryTable() {
  const { t } = useI18n();
  const queries = useMemo(() => getSlowQueries(), []);

  return (
    <div className="space-y-4">
      <p className="sam-text-helper text-sam-muted">{t("admin_performance_k7f4664cc")}</p>
      {queries.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          느린 쿼리가 없습니다.
        </div>
      ) : (
        <AdminTable headers={["쿼리명", "소요(ms)", "라우트", "감지 시각"]}>
          {queries.map((q) => (
            <tr key={q.id} className="border-b border-sam-border-soft">
              <td className="px-3 py-2.5 font-medium text-sam-fg">{q.queryName}</td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">{q.duration}</td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">{q.route}</td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(q.detectedAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
