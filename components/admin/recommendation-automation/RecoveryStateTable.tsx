"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getRecommendationRecoveryStates } from "@/lib/recommendation-automation/mock-recommendation-recovery-states";
import {
  recRecoveryModeLabel,
  recSurfaceLabel,
} from "@/components/admin/recommendation-admin-i18n";

export function RecoveryStateTable() {
  const { t } = useI18n();
  const [refresh, setRefresh] = useState(0);
  const states = useMemo(
    () => getRecommendationRecoveryStates(),
    [refresh]
  );

  if (states.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_rec_auto_empty_recovery")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[480px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_surface")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_current_mode")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_can_recover")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_reason")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_rec_th_checked_at")}
            </th>
          </tr>
        </thead>
        <tbody>
          {states.map((s) => (
            <tr
              key={s.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {recSurfaceLabel(t, s.surface)}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper ${
                    s.currentMode === "normal"
                      ? "bg-emerald-50 text-emerald-800"
                      : s.currentMode === "fallback"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-red-50 text-red-800"
                  }`}
                >
                  {recRecoveryModeLabel(t, s.currentMode)}
                </span>
              </td>
              <td className="px-3 py-2.5">
                {s.recoveryEligible ? (
                  <span className="sam-text-body-secondary text-emerald-600">
                    {t("admin_rec_recovery_possible")}
                  </span>
                ) : (
                  <span className="sam-text-body-secondary text-sam-muted">-</span>
                )}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {s.recoveryReason || "-"}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(s.checkedAt).toLocaleString(undefined, { hour12: false })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
