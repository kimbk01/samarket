"use client";

import { useState, useMemo } from "react";
import type { ExposureSurface } from "@/lib/types/exposure";
import {
  getExposureScorePolicyBySurface,
} from "@/lib/exposure/mock-exposure-score-policies";
import { addExposurePolicyLog } from "@/lib/exposure/mock-exposure-policy-logs";
import { getExposureCandidatesAll } from "@/lib/exposure/mock-exposure-candidates";
import { computeAndSortCandidates } from "@/lib/exposure/exposure-score-utils";
import { SURFACE_OPTIONS } from "@/lib/exposure/exposure-policy-utils";
import { ExposureResultTable } from "./ExposureResultTable";

interface ExposureSimulatorProps {
  onSimulated?: () => void;
}

export function ExposureSimulator({ onSimulated }: ExposureSimulatorProps) {
  const [surface, setSurface] = useState<ExposureSurface>("home");
  const [run, setRun] = useState(0);

  const policy = useMemo(
    () => getExposureScorePolicyBySurface(surface),
    [surface]
  );
  const candidates = useMemo(() => getExposureCandidatesAll(), []);
  const results = useMemo(() => {
    if (!policy) return [];
    return computeAndSortCandidates(
      candidates,
      policy,
      surface,
      null
    );
  }, [candidates, policy, surface, run]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sam-text-body font-medium text-sam-fg">
          surface
        </label>
        <select
          value={surface}
          onChange={(e) => setSurface(e.target.value as ExposureSurface)}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {SURFACE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            if (policy) {
              addExposurePolicyLog(
                policy.id,
                policy.surface,
                "simulate",
                "시뮬레이션 실행"
              );
              onSimulated?.();
            }
            setRun((r) => r + 1);
          }}
          className="rounded border border-signature bg-signature px-3 py-2 sam-text-body font-medium text-white"
        >
          시뮬레이션 실행
        </button>
      </div>
      {!policy && (
        <p className="sam-text-body text-amber-700">
          해당 surface의 활성 정책이 없습니다.
        </p>
      )}
      {policy && (
        <ExposureResultTable
          results={results}
          surface={surface}
          policyName={policy.policyName}
        />
      )}
    </div>
  );
}
