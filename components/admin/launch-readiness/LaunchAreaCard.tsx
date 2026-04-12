"use client";

import type { LaunchReadinessAreasEntry } from "@/lib/types/launch-readiness";
import { getAreaLabel, getStatusLabel } from "@/lib/launch-readiness/launch-readiness-utils";

interface LaunchAreaCardProps {
  entry: LaunchReadinessAreasEntry;
}

export function LaunchAreaCard({ entry }: LaunchAreaCardProps) {
  const isBlocked = entry.status === "blocked";
  const isReady = entry.status === "ready";
  const isInProgress = entry.status === "in_progress";

  return (
    <div
      className={`rounded-ui-rect border p-4 ${
        isBlocked
          ? "border-red-200 bg-red-50/50"
          : isReady
            ? "border-emerald-200 bg-emerald-50/30"
            : isInProgress
              ? "border-amber-200 bg-amber-50/30"
              : "border-sam-border bg-sam-surface"
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sam-fg">
          {getAreaLabel(entry.area)}
        </h3>
        <span
          className={`rounded px-1.5 py-0.5 text-[12px] ${
            isReady
              ? "bg-emerald-100 text-emerald-800"
              : isBlocked
                ? "bg-red-100 text-red-800"
                : "bg-sam-surface-muted text-sam-muted"
          }`}
        >
          {getStatusLabel(entry.status)}
        </span>
      </div>
      <p className="mt-2 text-[24px] font-semibold text-sam-fg">
        {entry.score}%
      </p>
      <p className="mt-1 text-[13px] text-sam-muted">
        완료 {entry.readyItems} / {entry.totalItems}
        {entry.blockedItems > 0 && (
          <span className="ml-1 text-red-600">· 차단 {entry.blockedItems}</span>
        )}
      </p>
      {entry.ownerAdminNickname && (
        <p className="mt-2 text-[12px] text-sam-muted">
          담당 {entry.ownerAdminNickname}
        </p>
      )}
    </div>
  );
}
