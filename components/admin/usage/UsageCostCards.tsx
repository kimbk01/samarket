"use client";

import { useMemo } from "react";
import { getLatestUsageMetric } from "@/lib/usage/mock-usage-metrics";

export function UsageCostCards() {
  const latest = useMemo(() => getLatestUsageMetric(), []);

  const surge =
    latest &&
    (latest.apiRequests > 500000 || latest.estimatedCost > 90);

  return (
    <div className="space-y-4">
      {surge && (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50/50 p-3 text-[13px] font-medium text-amber-800">
          사용량/비용 급증 경고 (임계치 초과). 모니터링 권장.
        </div>
      )}
      {latest ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="text-[12px] text-sam-muted">DB 사용량</p>
            <p className="text-[20px] font-semibold text-sam-fg">
              {latest.dbUsage} GB
            </p>
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="text-[12px] text-sam-muted">Storage</p>
            <p className="text-[20px] font-semibold text-sam-fg">
              {latest.storageUsage} GB
            </p>
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="text-[12px] text-sam-muted">Bandwidth</p>
            <p className="text-[20px] font-semibold text-sam-fg">
              {latest.bandwidth} GB
            </p>
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="text-[12px] text-sam-muted">API 요청 수</p>
            <p className="text-[20px] font-semibold text-sam-fg">
              {(latest.apiRequests / 1000).toFixed(0)}K
            </p>
          </div>
          <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <p className="text-[12px] text-sam-muted">월간 비용 추정</p>
            <p className="text-[20px] font-semibold text-sam-fg">
              ${latest.estimatedCost}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-[14px] text-sam-muted">사용량 데이터 없음</p>
      )}
      <p className="text-[12px] text-sam-muted">
        사용량 그래프는 placeholder. Supabase 대시보드와 연동 가능.
      </p>
    </div>
  );
}
