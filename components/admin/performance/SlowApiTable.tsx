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
      <p className="text-[12px] text-gray-500">
        API {SLOW_THRESHOLD_MS}ms 이상 또는 로딩 시간이 느린 페이지 (최근 기준)
      </p>
      {slowItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          느린 API가 없습니다.
        </div>
      ) : (
        <AdminTable headers={["라우트", "로딩(ms)", "API(ms)", "DB(ms)", "측정 시각"]}>
          {slowItems.map((m) => (
            <tr key={m.id} className="border-b border-gray-100">
              <td className="px-3 py-2.5 font-medium text-gray-900">{m.route}</td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">{m.loadTime}</td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">{m.apiTime}</td>
              <td className="px-3 py-2.5 text-[13px] text-gray-600">{m.dbQueryTime}</td>
              <td className="px-3 py-2.5 text-[13px] text-gray-500">
                {new Date(m.createdAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
