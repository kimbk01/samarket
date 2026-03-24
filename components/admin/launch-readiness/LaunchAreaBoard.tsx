"use client";

import { useMemo, useState } from "react";
import { getLaunchReadinessAreasList } from "@/lib/launch-readiness/mock-launch-readiness-areas";
import { LaunchAreaCard } from "./LaunchAreaCard";
import type { LaunchReadinessPhase } from "@/lib/types/launch-readiness";
import { getPhaseLabel } from "@/lib/launch-readiness/launch-readiness-utils";

export function LaunchAreaBoard() {
  const [phase, setPhase] = useState<LaunchReadinessPhase>("pre_launch");
  const areas = useMemo(
    () => getLaunchReadinessAreasList(phase),
    [phase]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-gray-600">단계</span>
        {(["pre_launch", "launch_day", "post_launch"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPhase(p)}
            className={`rounded border px-3 py-1.5 text-[13px] ${
              phase === p
                ? "border-signature bg-signature/10 text-signature"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {getPhaseLabel(p)}
          </button>
        ))}
      </div>

      {areas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-12 text-center text-[14px] text-gray-500">
          영역별 데이터가 없습니다.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map((entry) => (
            <LaunchAreaCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}
