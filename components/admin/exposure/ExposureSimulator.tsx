"use client";

import { useState } from "react";
import type { ExposureCandidate, ExposureScoreResult, ExposureSurface } from "@/lib/types/exposure";
import { SURFACE_OPTIONS } from "@/lib/exposure/exposure-policy-utils";
import { ExposureResultTable } from "./ExposureResultTable";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

interface ExposureSimulatorProps {
  onSimulated?: () => void;
}

export function ExposureSimulator({ onSimulated }: ExposureSimulatorProps) {
  const { t } = useI18n();
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
        setErr(t("admin_exposure_simulation_failed"));
        setResults([]);
        return;
      }
      setResults(j.results ?? []);
      setPolicyName(String(j.policy?.policyName ?? ""));
      setCandidateCount(Number(j.candidateCount ?? 0));
      onSimulated?.();
    } catch {
      setErr(t("admin_exposure_simulation_failed"));
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
        <AdminActionButton
          disabled={busy}
          onClick={() => void runSimulation()}
          variant="primary"
        >
          {busy ? t("admin_exposure_running") : t("admin_exposure_kbbeb1f75")}
        </AdminActionButton>
      </div>
      {err ? <p className="sam-text-body text-sam-danger">{err}</p> : null}
      {candidateCount === 0 && results.length === 0 && !busy && !err ? (
        <p className="sam-text-body text-sam-muted">{t("admin_exposure_no_trade_candidates_run_simulation")}</p>
      ) : null}
      {results.length > 0 && (
        <ExposureResultTable results={results} surface={surface} policyName={policyName || surface} />
      )}
    </div>
  );
}
