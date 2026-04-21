"use client";

import { useState } from "react";
import type {
  OpsRunbookOutcomeType,
  OpsRunbookSeverityAfter,
} from "@/lib/types/ops-runbook";
import { getOpsRunbookResults } from "@/lib/ops-runbooks/mock-ops-runbook-results";
import { writeRunbookResult } from "@/lib/ops-runbooks/ops-runbook-utils";

const OUTCOME_OPTIONS: { value: OpsRunbookOutcomeType; label: string }[] = [
  { value: "resolved", label: "해결" },
  { value: "mitigated", label: "완화" },
  { value: "rolled_back", label: "롤백" },
  { value: "fallback_applied", label: "Fallback 적용" },
  { value: "monitoring_only", label: "모니터링만" },
  { value: "escalated", label: "에스컬레이션" },
];

const SEVERITY_OPTIONS: { value: OpsRunbookSeverityAfter; label: string }[] = [
  { value: "low", label: "낮음" },
  { value: "medium", label: "중간" },
  { value: "high", label: "높음" },
  { value: "critical", label: "긴급" },
];

const ADMIN_ID = "admin1";
const ADMIN_NICK = "관리자";

interface OpsRunbookResultFormProps {
  executionId: string;
  onSaved?: () => void;
}

export function OpsRunbookResultForm({
  executionId,
  onSaved,
}: OpsRunbookResultFormProps) {
  const [outcomeType, setOutcomeType] = useState<OpsRunbookOutcomeType>("resolved");
  const [severityAfter, setSeverityAfter] = useState<OpsRunbookSeverityAfter>("low");
  const [summary, setSummary] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [followupNeeded, setFollowupNeeded] = useState(false);

  const existingResults = getOpsRunbookResults(executionId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    writeRunbookResult(
      executionId,
      outcomeType,
      severityAfter,
      summary,
      rootCause,
      followupNeeded,
      ADMIN_ID,
      ADMIN_NICK
    );
    setSummary("");
    setRootCause("");
    setFollowupNeeded(false);
    onSaved?.();
  };

  return (
    <div className="space-y-4">
      {existingResults.length > 0 && (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
          <h3 className="sam-text-body font-medium text-sam-fg">기존 결과 기록</h3>
          <ul className="mt-2 space-y-2 sam-text-body-secondary text-sam-fg">
            {existingResults.map((r) => (
              <li key={r.id}>
                {r.outcomeType} · {r.severityAfter} · {r.summary}
                {r.followupNeeded && " (후속 조치 예정)"}
              </li>
            ))}
          </ul>
        </div>
      )}
      <form onSubmit={handleSubmit} className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="mb-3 sam-text-body font-medium text-sam-fg">대응 결과 기록</h3>
        <p className="mb-3 sam-text-helper text-sam-muted">
          후속 조치 필요 시 체크하면 38단계 액션아이템이 생성됩니다.
        </p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block sam-text-helper text-sam-fg">결과 유형</label>
            <select
              value={outcomeType}
              onChange={(e) => setOutcomeType(e.target.value as OpsRunbookOutcomeType)}
              className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
            >
              {OUTCOME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block sam-text-helper text-sam-fg">조치 후 심각도</label>
            <select
              value={severityAfter}
              onChange={(e) => setSeverityAfter(e.target.value as OpsRunbookSeverityAfter)}
              className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
            >
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block sam-text-helper text-sam-fg">요약</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              required
              className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
            />
          </div>
          <div>
            <label className="mb-1 block sam-text-helper text-sam-fg">원인 (placeholder)</label>
            <input
              type="text"
              value={rootCause}
              onChange={(e) => setRootCause(e.target.value)}
              className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
            />
          </div>
          <label className="flex items-center gap-2 sam-text-body text-sam-fg">
            <input
              type="checkbox"
              checked={followupNeeded}
              onChange={(e) => setFollowupNeeded(e.target.checked)}
            />
            후속 조치 필요 (액션아이템 생성)
          </label>
        </div>
        <button
          type="submit"
          className="mt-4 rounded border border-signature bg-signature px-4 py-2 sam-text-body font-medium text-white"
        >
          결과 기록
        </button>
      </form>
    </div>
  );
}
