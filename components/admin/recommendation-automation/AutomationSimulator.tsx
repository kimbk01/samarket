"use client";

import { useState } from "react";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import {
  evaluateAutomation,
  runAutomationForSurface,
} from "@/lib/recommendation-automation/recommendation-automation-utils";
import { persistRecommendationRuntimeToServer } from "@/lib/recommendation-ops/recommendation-runtime-sync-client";
import { SURFACE_LABELS } from "@/lib/recommendation-experiments/recommendation-experiment-utils";

const SURFACES: RecommendationSurface[] = ["home", "search", "shop"];

export function AutomationSimulator() {
  const [surface, setSurface] = useState<RecommendationSurface>("home");
  const [mode, setMode] = useState<"dry_run" | "live">("dry_run");
  const [result, setResult] = useState<ReturnType<typeof evaluateAutomation> & { actionTaken?: string } | null>(null);

  const handleEval = () => {
    setResult(evaluateAutomation(surface));
  };

  const handleRun = () => {
    const r = runAutomationForSurface(surface, mode);
    setResult({
      ...r,
      actionTaken: r.actionTaken,
    });
    void persistRecommendationRuntimeToServer().then((p) => {
      if (!p.ok) console.warn("[automation] runtime persist failed", p.error);
    });
  };

  return (
    <div className="space-y-4">
      <p className="sam-text-body-secondary text-sam-muted">
        조건 평가만 하거나, Dry-run / Live 로 자동 조치를 한 번 실행할 수 있습니다.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="sam-text-body font-medium text-sam-fg">surface</label>
        <select
          value={surface}
          onChange={(e) => {
            setSurface(e.target.value as RecommendationSurface);
            setResult(null);
          }}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          {SURFACES.map((s) => (
            <option key={s} value={s}>
              {SURFACE_LABELS[s]}
            </option>
          ))}
        </select>
        <label className="sam-text-body font-medium text-sam-fg">실행 모드</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "dry_run" | "live")}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="dry_run">Dry-run (기록만)</option>
          <option value="live">Live (실제 반영)</option>
        </select>
        <button
          type="button"
          onClick={handleEval}
          className="rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-body font-medium text-sam-fg"
        >
          조건만 평가
        </button>
        <button
          type="button"
          onClick={handleRun}
          className="rounded border border-signature bg-signature px-3 py-2 sam-text-body font-medium text-white"
        >
          실행
        </button>
      </div>
      {result && (
        <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
          <p className="mb-2 sam-text-body font-medium text-sam-fg">결과</p>
          <ul className="space-y-1 sam-text-body-secondary text-sam-fg">
            <li>Fallback 필요: {result.shouldFallback ? "예" : "아니오"}</li>
            <li>킬스위치 필요: {result.shouldKillSwitch ? "예" : "아니오"}</li>
            <li>롤백 필요: {result.shouldRollback ? "예" : "아니오"}</li>
            <li>복귀 필요: {result.shouldRecovery ? "예" : "아니오"}</li>
            {result.actionTaken && (
              <li className="font-medium text-signature">
                수행한 조치: {result.actionTaken}
              </li>
            )}
            <li>사유: {result.reason}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
