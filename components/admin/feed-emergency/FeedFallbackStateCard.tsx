"use client";

import { useMemo, useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import { getFeedFallbackStates } from "@/lib/feed-emergency/feed-emergency-state";
import { getFeedMode } from "@/lib/feed-emergency/feed-emergency-utils";
import { getFeedVersionById } from "@/lib/recommendation-experiments/mock-feed-versions";
import { getActiveFeedVersionBySurface } from "@/lib/recommendation-deployments/mock-active-feed-versions";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

const MODE_LABELS: Record<string, string> = {
  normal: "정상",
  fallback: "Fallback",
  kill_switch: "킬스위치",
};

export function FeedFallbackStateCard() {
  const [refresh, setRefresh] = useState(0);

  const states = useMemo(
    () => getFeedFallbackStates(),
    [refresh]
  );

  if (states.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
        상태가 없습니다.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {states.map((s) => {
        const mode = getFeedMode(s.surface);
        const activeRow = getActiveFeedVersionBySurface(s.surface);
        const activeVersionId = s.activeVersionId ?? activeRow?.liveVersionId ?? null;
        const activeVersion = activeVersionId
          ? getFeedVersionById(activeVersionId)
          : null;
        const fallbackVersion = s.fallbackVersionId
          ? getFeedVersionById(s.fallbackVersionId)
          : null;
        return (
          <div
            key={s.id}
            className={`rounded-ui-rect border p-4 ${
              mode === "kill_switch"
                ? "border-amber-200 bg-amber-50/50"
                : mode === "fallback"
                  ? "border-emerald-200 bg-emerald-50/50"
                  : "border-sam-border bg-sam-surface"
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium text-sam-fg">
                {SURFACE_LABELS[s.surface]}
              </span>
              <span
                className={`rounded px-2 py-0.5 text-[12px] font-medium ${
                  mode === "kill_switch"
                    ? "bg-amber-100 text-amber-800"
                    : mode === "fallback"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-sam-surface-muted text-sam-muted"
                }`}
              >
                {MODE_LABELS[mode]}
              </span>
            </div>
            <dl className="space-y-1 text-[13px]">
              <div>
                <dt className="text-sam-muted">활성 버전</dt>
                <dd className="text-sam-fg">
                  {activeVersion?.versionName ?? activeVersionId ?? "-"}
                </dd>
              </div>
              {s.fallbackVersionId && (
                <div>
                  <dt className="text-sam-muted">Fallback 버전</dt>
                  <dd className="text-sam-fg">
                    {fallbackVersion?.versionName ?? s.fallbackVersionId}
                  </dd>
                </div>
              )}
              {s.fallbackReason && (
                <div>
                  <dt className="text-sam-muted">사유</dt>
                  <dd className="text-sam-fg">{s.fallbackReason}</dd>
                </div>
              )}
              <div>
                <dt className="text-sam-muted">갱신</dt>
                <dd className="text-sam-muted">
                  {new Date(s.updatedAt).toLocaleString("ko-KR")}
                </dd>
              </div>
            </dl>
          </div>
        );
      })}
    </div>
  );
}
