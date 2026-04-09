"use client";

import { useState } from "react";
import type { ExpireSimulationResult } from "@/lib/points/run-point-expire";
import { simulatePointExpire, runPointExpire } from "@/lib/points/run-point-expire";

interface AdminPointExpireRunPanelProps {
  onRunComplete?: () => void;
}

export function AdminPointExpireRunPanel({
  onRunComplete,
}: AdminPointExpireRunPanelProps) {
  const [asOfDate, setAsOfDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [simResult, setSimResult] = useState<ExpireSimulationResult | null>(null);
  const [runSummary, setRunSummary] = useState<{
    totalExpired: number;
    executionCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSimulate = (e: React.FormEvent) => {
    e.preventDefault();
    const result = simulatePointExpire(asOfDate);
    setSimResult(result ?? null);
    setRunSummary(null);
  };

  const handleRun = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { executionIds, totalExpired } = runPointExpire(asOfDate, "admin");
    setRunSummary({
      totalExpired,
      executionCount: executionIds.length,
    });
    setSimResult(null);
    setLoading(false);
    onRunComplete?.();
  };

  return (
    <div className="space-y-4 rounded-ui-rect border border-gray-200 bg-white p-4">
      <h3 className="text-[15px] font-medium text-gray-900">
        만료 시뮬레이션 / 실행
      </h3>
      <form onSubmit={handleSimulate} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-0.5 block text-[12px] text-gray-600">
            기준일
          </label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="rounded border border-gray-200 px-3 py-2 text-[14px]"
          />
        </div>
        <button
          type="submit"
          className="rounded border border-gray-200 bg-white px-3 py-2 text-[14px] text-gray-700 hover:bg-gray-50"
        >
          시뮬레이션
        </button>
        <button
          type="button"
          onClick={handleRun}
          disabled={loading}
          className="rounded border border-signature bg-signature px-3 py-2 text-[14px] font-medium text-white disabled:opacity-50"
        >
          {loading ? "처리 중…" : "만료 실행"}
        </button>
      </form>
      {simResult && (
        <div className="rounded border border-amber-200 bg-amber-50/50 p-3 text-[14px]">
          <p className="font-medium text-amber-900">
            시뮬레이션 결과 (기준일: {simResult.asOfDate})
          </p>
          <p className="mt-1 text-amber-800">
            정책: {simResult.policyName} · 대상 {simResult.items.length}건, 사용자{" "}
            {simResult.totalByUser.size}명
          </p>
          <ul className="mt-2 list-inside list-disc text-[13px] text-amber-800">
            {Array.from(simResult.totalByUser.entries()).map(([uid, v]) => (
              <li key={uid}>
                {v.nickname}: {v.total}P 만료 예정
              </li>
            ))}
          </ul>
        </div>
      )}
      {runSummary && (
        <div className="rounded border border-emerald-200 bg-emerald-50/50 p-3 text-[14px]">
          <p className="font-medium text-emerald-900">실행 완료</p>
          <p className="mt-1 text-emerald-800">
            총 {runSummary.totalExpired}P 만료, {runSummary.executionCount}건 실행
          </p>
        </div>
      )}
    </div>
  );
}
