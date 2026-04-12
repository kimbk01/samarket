"use client";

import { useMemo } from "react";
import { getSystemHealth } from "@/lib/system/mock-system-health";
import { getSystemHealthStatusLabel } from "@/lib/system/system-utils";
import type { SystemHealthStatus } from "@/lib/types/system";

export function SystemHealthList() {
  const health = useMemo(() => getSystemHealth(), []);

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-sam-muted">서비스 health 체크</p>
      {health.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
          서비스 상태 없음
        </div>
      ) : (
        <ul className="space-y-2">
          {health.map((h) => (
            <li
              key={h.id}
              className={`flex flex-wrap items-center justify-between rounded-ui-rect border p-3 ${
                h.status === "critical"
                  ? "border-red-200 bg-red-50/30"
                  : h.status === "warning"
                    ? "border-amber-200 bg-amber-50/30"
                    : "border-sam-border bg-sam-surface"
              }`}
            >
              <span className="font-medium text-sam-fg">{h.serviceName}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[12px] ${
                  h.status === "healthy"
                    ? "bg-emerald-50 text-emerald-700"
                    : h.status === "warning"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-red-100 text-red-800"
                }`}
              >
                {getSystemHealthStatusLabel(h.status as SystemHealthStatus)}
              </span>
              <span className="w-full text-[12px] text-sam-muted sm:w-auto">
                {new Date(h.lastCheckedAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
