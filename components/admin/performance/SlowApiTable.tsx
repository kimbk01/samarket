"use client";

import { useMemo } from "react";
import { getPerformanceMetrics } from "@/lib/performance/mock-performance-metrics";
import { AdminTable } from "@/components/admin/AdminTable";

const SLOW_THRESHOLD_MS = 500;

export function SlowApiTable() {
  const slowItems = useMemo(() => {
    const list = getPerformanceMetrics();
    return list
      .filter((m) => m.apiTime >= SLOW_THRESHOLD_MS || m.loadTime >= SLOW_THRESHOLD_MS)
      .sort((a, b) => b.apiTime - a.apiTime)
      .slice(0, 20);
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-sam-muted">
        API {SLOW_THRESHOLD_MS}ms 이상 또는 로딩 시간이 느린 페이지 (최근 기준)
      </p>
      {slowItems.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
          느린 API가 없습니다.
        </div>
      ) : (
        <AdminTable headers={["라우트", "로딩(ms)", "API(ms)", "DB(ms)", "측정 시각"]}>
          {slowItems.map((m) => (
            <tr key={m.id} className="border-b border-sam-border-soft">
              <td className="px-3 py-2.5 font-medium text-sam-fg">{m.route}</td>
              <td className="px-3 py-2.5 text-[13px] text-sam-muted">{m.loadTime}</td>
              <td className="px-3 py-2.5 text-[13px] text-sam-muted">{m.apiTime}</td>
              <td className="px-3 py-2.5 text-[13px] text-sam-muted">{m.dbQueryTime}</td>
              <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                {new Date(m.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
