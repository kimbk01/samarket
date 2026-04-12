"use client";

import { useMemo, useState } from "react";
import { getLaunchReadinessSummary } from "@/lib/launch-readiness/mock-launch-readiness-summary";
import {
  getGoLiveLabel,
  getAreaLabel,
} from "@/lib/launch-readiness/launch-readiness-utils";
import type { LaunchReadinessPhase } from "@/lib/types/launch-readiness";

const PHASE_OPTIONS: { value: LaunchReadinessPhase | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "pre_launch", label: "Pre-Launch" },
  { value: "launch_day", label: "Launch Day" },
  { value: "post_launch", label: "Post-Launch" },
];

export function LaunchReadinessSummaryCards() {
  const [phase, setPhase] = useState<LaunchReadinessPhase | "">("pre_launch");
  const summary = useMemo(
    () =>
      getLaunchReadinessSummary(
        phase === "" ? undefined : (phase as LaunchReadinessPhase)
      ),
    [phase]
  );

  const goClass =
    summary.goLiveRecommendation === "go"
      ? "text-emerald-700"
      : summary.goLiveRecommendation === "conditional_go"
        ? "text-amber-700"
        : "text-red-700";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-sam-muted">단계</span>
        <select
          value={phase}
          onChange={(e) =>
            setPhase((e.target.value || "") as LaunchReadinessPhase | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 text-[13px] text-sam-fg"
        >
          {PHASE_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="text-[12px] text-sam-muted">Readiness 점수</p>
          <p className="text-[24px] font-semibold text-sam-fg">
            {summary.overallScore}%
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="text-[12px] text-sam-muted">Must-Have</p>
          <p className="text-[20px] font-semibold text-sam-fg">
            {summary.mustHaveReady} / {summary.mustHaveTotal}
          </p>
          {summary.mustHaveReady < summary.mustHaveTotal && (
            <p className="mt-1 text-[12px] text-amber-600">미완료 항목 있음</p>
          )}
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="text-[12px] text-sam-muted">Should-Have</p>
          <p className="text-[20px] font-semibold text-sam-fg">
            {summary.shouldHaveReady} / {summary.shouldHaveTotal}
          </p>
        </div>
        <div
          className={`rounded-ui-rect border p-4 ${
            summary.goLiveRecommendation === "no_go"
              ? "border-red-200 bg-red-50/50"
              : summary.goLiveRecommendation === "conditional_go"
                ? "border-amber-200 bg-amber-50/50"
                : "border-emerald-200 bg-emerald-50/30"
          }`}
        >
          <p className="text-[12px] text-sam-muted">최종 Go / No-Go</p>
          <p className={`text-[20px] font-semibold ${goClass}`}>
            {getGoLiveLabel(summary.goLiveRecommendation)}
          </p>
          {summary.blockedCount > 0 && (
            <p className="mt-1 text-[12px] text-red-600">
              차단 {summary.blockedCount}건
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="text-[12px] text-sam-muted">준비 완료 영역</p>
          <p className="text-[14px] text-sam-fg">
            {summary.readyAreas.length > 0
              ? summary.readyAreas.map(getAreaLabel).join(", ")
              : "없음"}
          </p>
        </div>
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <p className="text-[12px] text-sam-muted">미준비 영역</p>
          <p className="text-[14px] text-sam-fg">
            {summary.notReadyAreas.length > 0
              ? summary.notReadyAreas.map(getAreaLabel).join(", ")
              : "없음"}
          </p>
        </div>
      </div>

      {summary.latestUpdatedAt && (
        <p className="text-[12px] text-sam-muted">
          최종 갱신: {new Date(summary.latestUpdatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
