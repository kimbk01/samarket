"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { RecommendationSurface } from "@/lib/types/recommendation";
import {
  getRecommendationAutomationPolicies,
  saveRecommendationAutomationPolicy,
} from "@/lib/recommendation-ops/recommendation-ops-state";
import { commitRecommendationOpsChange } from "@/lib/recommendation-ops/recommendation-ops-sync-client";
import { AdminEmptyState, AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import {
  recFallbackModeLabel,
  recSurfaceLabel,
} from "@/components/admin/recommendation-admin-i18n";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";

export function AutomationPolicyTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: false; code: string } | null>(null);
  const policies = useMemo(
    () => getRecommendationAutomationPolicies(),
    [refresh]
  );

  /** 변경 → 저장. 실패면 정책을 되돌리고 실패 문구 표시 (예전: console.warn 만). */
  const flush = async (mutate: () => void) => {
    setBusy(true);
    const r = await commitRecommendationOpsChange(mutate);
    setBusy(false);
    setSaveResult(r.ok ? null : { ok: false, code: r.error ?? "save_failed" });
    setRefresh((x) => x + 1);
  };

  const handleToggle = async (
    id: string,
    _surface: RecommendationSurface,
    field: keyof (typeof policies)[0],
    value: boolean
  ) => {
    const p = policies.find((x) => x.id === id);
    if (!p) return;
    await flush(() => saveRecommendationAutomationPolicy({ ...p, [field]: value }));
  };

  if (policies.length === 0) {
    return <AdminEmptyState ko={ko} message={t("admin_rec_auto_empty_policy")} />;
  }

  return (
    <>
    <AdminResultBanner ko={ko} result={saveResult} onClose={() => setSaveResult(null)} />
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[800px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_surface")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_enabled")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_auto_col_auto_fallback")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_auto_col_auto_kill_switch")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_auto_col_auto_rollback")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_auto_col_auto_recovery")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_dry_run")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_auto_col_fallback_mode")}
            </th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr
              key={p.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {recSurfaceLabel(t, p.surface)}
              </td>
              <td className="px-3 py-2.5">
                <AdminChipButton
                  selected={p.isActive}
                  type="button"
                  disabled={busy}
                  onClick={() => void handleToggle(p.id, p.surface, "isActive", !p.isActive)}
                >
                  {p.isActive ? "ON" : "OFF"}
                </AdminChipButton>
              </td>
              <td className="px-3 py-2.5">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={p.autoFallbackEnabled}
                    onChange={(e) => {
                      void flush(() =>
                        saveRecommendationAutomationPolicy({
                          ...p,
                          autoFallbackEnabled: e.target.checked,
                        })
                      );
                    }}
                    className="rounded border-sam-border"
                  />
                </label>
              </td>
              <td className="px-3 py-2.5">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={p.autoKillSwitchEnabled}
                    onChange={(e) => {
                      void flush(() =>
                        saveRecommendationAutomationPolicy({
                          ...p,
                          autoKillSwitchEnabled: e.target.checked,
                        })
                      );
                    }}
                    className="rounded border-sam-border"
                  />
                </label>
              </td>
              <td className="px-3 py-2.5">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={p.autoRollbackEnabled}
                    onChange={(e) => {
                      void flush(() =>
                        saveRecommendationAutomationPolicy({
                          ...p,
                          autoRollbackEnabled: e.target.checked,
                        })
                      );
                    }}
                    className="rounded border-sam-border"
                  />
                </label>
              </td>
              <td className="px-3 py-2.5">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={p.autoRecoveryEnabled}
                    onChange={(e) => {
                      void flush(() =>
                        saveRecommendationAutomationPolicy({
                          ...p,
                          autoRecoveryEnabled: e.target.checked,
                        })
                      );
                    }}
                    className="rounded border-sam-border"
                  />
                </label>
              </td>
              <td className="px-3 py-2.5">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={p.dryRunEnabled}
                    onChange={(e) => {
                      void flush(() =>
                        saveRecommendationAutomationPolicy({
                          ...p,
                          dryRunEnabled: e.target.checked,
                        })
                      );
                    }}
                    className="rounded border-sam-border"
                  />
                </label>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-fg">
                {recFallbackModeLabel(t, p.fallbackMode)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
