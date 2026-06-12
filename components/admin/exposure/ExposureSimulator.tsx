"use client";

import { useState } from "react";
import type { ExposureCandidate, ExposureScoreResult, ExposureSurface } from "@/lib/types/exposure";
import { SURFACE_OPTIONS } from "@/lib/exposure/exposure-policy-utils";
import { ExposureResultTable } from "./ExposureResultTable";

interface ExposureSimulatorProps {
  onSimulated?: () => void;
}

export function ExposureSimulator({ onSimulated }: ExposureSimulatorProps) {
  const [surface, setSurface] = useState<ExposureSurface>("home");
  const [results, setResults] = useState<{ candidate: ExposureCandidate; result: ExposureScoreResult }[]>([]);
  const [policyName, setPolicyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [candidateCount, setCandidateCount] = useState(0);

  const runSimulation = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/admin/exposure-policies/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ surface }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        results?: { candidate: ExposureCandidate; result: ExposureScoreResult }[];
        policy?: { policyName?: string };
        candidateCount?: number;
        error?: string;
      };
      if (!res.ok || !j.ok) {
        setErr("시뮬레이션에 실패했습니다.");
        setResults([]);
        return;
      }
      setResults(j.results ?? []);
      setPolicyName(String(j.policy?.policyName ?? ""));
      setCandidateCount(Number(j.candidateCount ?? 0));
      onSimulated?.();
    } catch {
      setErr("시뮬레이션에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sam-text-body font-medium text-sam-fg">surface</label>
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
          disabled={busy}
          onClick={() => void runSimulation()}
          className="rounded border border-signature bg-signature px-3 py-2 sam-text-body font-medium text-white disabled:opacity-50"
        >
          {busy ? "실행 중…" : "시뮬레이션 실행"}
        </button>
      </div>
      {err ? <p className="sam-text-body text-red-600">{err}</p> : null}
      {candidateCount === 0 && results.length === 0 && !busy && !err ? (
        <p className="sam-text-body text-sam-muted">거래 상품 후보가 없습니다. 시뮬레이션을 실행해 보세요.</p>
      ) : null}
      {results.length > 0 && (
        <ExposureResultTable results={results} surface={surface} policyName={policyName || surface} />
      )}
    </div>
  );
}
