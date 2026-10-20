"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import {
  evaluateAutomation,
  runAutomationForSurface,
} from "@/lib/recommendation-automation/recommendation-automation-utils";
import {
  loadRecommendationRecordsSummaryFromServer,
  recordRecommendationAutomationExecution,
} from "@/lib/recommendation-ops/recommendation-records-client";
import { AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { recSurfaceLabel } from "@/components/admin/recommendation-admin-i18n";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

const SURFACES: RecommendationSurface[] = ["home", "search", "shop"];

export function AutomationSimulator() {
  const { t, language } = useI18n();
  const [busy, setBusy] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: false; code: string } | null>(null);
  const [surface, setSurface] = useState<RecommendationSurface>("home");
  const [mode, setMode] = useState<"dry_run" | "live">("dry_run");
  const [result, setResult] = useState<
    ReturnType<typeof evaluateAutomation> & { actionTaken?: string }
  | null>(null);

  const handleEval = () => {
    setResult(evaluateAutomation(surface));
  };

  /**
   * 실행 → 실행 기록 1건을 서버에 INSERT (예전: 런타임 묶음 전체 PUT). 저장 실패 → 결과 숨김 + 실패 문구.
   * 저장 성공 → 요약(오늘 실행 수 등)을 DB 에서 다시 읽는다.
   */
  const handleRun = async () => {
    setBusy(true);
    const run = runAutomationForSurface(surface, mode);
    if (run.execution) {
      const p = await recordRecommendationAutomationExecution(run.execution);
      if (!p.ok) {
        setBusy(false);
        setSaveResult({ ok: false, code: p.error ?? "save_failed" });
        setResult(null);
        return;
      }
      await loadRecommendationRecordsSummaryFromServer();
    }
    setBusy(false);
    setSaveResult(null);
    setResult(run);
  };

  return (
    <div className="space-y-4">
      <AdminResultBanner ko={language !== "en"} result={saveResult} onClose={() => setSaveResult(null)} />
      <p className="sam-text-body-secondary text-sam-muted">
        {t("admin_rec_auto_sim_intro")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="sam-text-body font-medium text-sam-fg">
          {t("admin_rec_th_surface")}
        </label>
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
              {recSurfaceLabel(t, s)}
            </option>
          ))}
        </select>
        <label className="sam-text-body font-medium text-sam-fg">
          {t("admin_rec_auto_sim_mode_label")}
        </label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as "dry_run" | "live")}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="dry_run">{t("admin_rec_auto_sim_mode_dry_run")}</option>
          <option value="live">{t("admin_rec_auto_sim_mode_live")}</option>
        </select>
        <AdminActionButton
          variant="secondary"
          type="button"
          onClick={handleEval}
        >
          {t("admin_rec_auto_sim_eval_only")}
        </AdminActionButton>
        <AdminActionButton
          variant="primary"
          type="button"
          disabled={busy}
          onClick={() => void handleRun()}
        >
          {t("admin_rec_auto_sim_run")}
        </AdminActionButton>
      </div>
      {result && (
        <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
          <p className="mb-2 sam-text-body font-medium text-sam-fg">
            {t("admin_rec_auto_sim_result")}
          </p>
          <ul className="space-y-1 sam-text-body-secondary text-sam-fg">
            <li>
              {t("admin_rec_auto_sim_need_fallback")}:{" "}
              {result.shouldFallback ? t("admin_rec_yes") : t("admin_rec_no")}
            </li>
            <li>
              {t("admin_rec_auto_sim_need_kill_switch")}:{" "}
              {result.shouldKillSwitch ? t("admin_rec_yes") : t("admin_rec_no")}
            </li>
            <li>
              {t("admin_rec_auto_sim_need_rollback")}:{" "}
              {result.shouldRollback ? t("admin_rec_yes") : t("admin_rec_no")}
            </li>
            <li>
              {t("admin_rec_auto_sim_need_recovery")}:{" "}
              {result.shouldRecovery ? t("admin_rec_yes") : t("admin_rec_no")}
            </li>
            {result.actionTaken && (
              <li className="font-medium text-signature">
                {t("admin_rec_auto_sim_action_taken")}: {result.actionTaken}
              </li>
            )}
            <li>
              {t("admin_rec_th_reason")}: {result.reason}
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
