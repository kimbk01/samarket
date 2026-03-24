"use client";

import { useMemo } from "react";
import { getOperationStatus } from "@/lib/system/mock-operation-status";
import { getSystemHealth } from "@/lib/system/mock-system-health";

export function OperationStatusCards() {
  const status = useMemo(() => getOperationStatus(), []);
  const health = useMemo(() => getSystemHealth(), []);

  const allHealthy =
    health.length > 0 && health.every((h) => h.status === "healthy");
  const hasCritical = health.some((h) => h.status === "critical");
  const readiness = allHealthy && status.errorRate < 1 && !hasCritical;
  const readyForScale = readiness && status.uptime >= 99.9;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">가동률</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {status.uptime}%
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">활성 사용자</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {status.activeUsers}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">에러율</p>
          <p className="text-[20px] font-semibold text-gray-900">
            {status.errorRate}%
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-[12px] text-gray-500">운영 준비 상태</p>
          <p
            className={`text-[14px] font-semibold ${
              readiness ? "text-emerald-600" : "text-amber-600"
            }`}
          >
            {readiness ? "준비됨" : "점검 필요"}
          </p>
        </div>
      </div>
      {readyForScale && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-center">
          <p className="text-[18px] font-semibold text-emerald-800">
            READY FOR SCALE
          </p>
          <p className="mt-1 text-[13px] text-emerald-700">
            전체 시스템 정상·운영 종료 없이 지속 운영 구조
          </p>
        </div>
      )}
      <p className="text-[12px] text-gray-500">
        최종 갱신: {new Date(status.lastUpdatedAt).toLocaleString()}
      </p>
    </div>
  );
}
