"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import {
  evaluateAutomation,
  runAutomationForSurface,
} from "@/lib/recommendation-automation/recommendation-automation-utils";
import { persistRecommendationRuntimeToServer } from "@/lib/recommendation-ops/recommendation-runtime-sync-client";
import { recSurfaceLabel } from "@/components/admin/recommendation-admin-i18n";

const SURFACES: RecommendationSurface[] = ["home", "search", "shop"];

export function AutomationSimulator() {
  const { t } = useI18n();
  const [surface, setSurface] = useState<RecommendationSurface>("home");
  const [mode, setMode] = useState<"dry_run" | "live">("dry_run");
  const [result, setResult] = useState<
    ReturnType<typeof evaluateAutomation> & { actionTaken?: string }
  | null>(null);

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
        <button
          type="button"
          onClick={handleEval}
          className="rounded border border-sam-border bg-sam-app px-3 py-2 sam-text-body font-medium text-sam-fg"
        >
          {t("admin_rec_auto_sim_eval_only")}
        </button>
        <button
          type="button"
          onClick={handleRun}
          className="rounded border border-signature bg-signature px-3 py-2 sam-text-body font-medium text-white"
        >
          {t("admin_rec_auto_sim_run")}
        </button>
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
