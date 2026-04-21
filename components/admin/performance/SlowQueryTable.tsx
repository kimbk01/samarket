"use client";

import { useMemo } from "react";
import { getSlowQueries } from "@/lib/performance/mock-slow-queries";
import { AdminTable } from "@/components/admin/AdminTable";

export function SlowQueryTable() {
  const queries = useMemo(() => getSlowQueries(), []);

  return (
    <div className="space-y-4">
      <p className="sam-text-helper text-sam-muted">쿼리 병목 리스트 (감지된 느린 쿼리)</p>
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
