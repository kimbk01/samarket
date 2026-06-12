"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo, useState } from "react";
import { getOpsMonthlyNotes } from "@/lib/ops-routines/ops-routines-state";

export function OpsMonthlyNoteList() {
  const { t } = useI18n();
  const [monthKey, setMonthKey] = useState<string>("");
  const notes = useMemo(
    () =>
      getOpsMonthlyNotes(monthKey ? { monthKey } : undefined),
    [monthKey]
  );

  const months = useMemo(() => {
    const list = getOpsMonthlyNotes();
    return [...new Set(list.map((n) => n.monthKey))].sort().reverse();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">{t("admin_ops_tools_routines_month_label")}</span>
        <select
          value={monthKey}
          onChange={(e) => setMonthKey(e.target.value)}
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("admin_ops_tools_surface_all")}</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <p className="sam-text-helper text-sam-muted">{t("admin_ops_tools_routines_month_hint")}</p>

      {notes.length === 0 ? (
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_routines_month_empty")}</div>
      ) : (
        <div className="space-y-4">
          {notes.map((n) => (
            <div
              key={n.id}
              className="rounded-ui-rect border border-sam-border bg-sam-surface p-4"
            >
              <div className="flex items-center justify-between sam-text-helper text-sam-muted">
                <span>{n.monthKey}</span>
                <span>
                  {n.createdByAdminNickname} ·{" "}
                  {new Date(n.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-2 sam-text-body font-medium text-sam-fg">{t("admin_ops_tools_board_label_summary")}</p>
              <p className="mt-1 sam-text-body-secondary text-sam-fg">{n.summary}</p>
              <p className="mt-2 sam-text-body-secondary font-medium text-sam-fg">{t("admin_ops_tools_routines_month_risks")}</p>
              <p className="mt-1 sam-text-body-secondary text-sam-muted">{n.topRisks}</p>
              <p className="mt-2 sam-text-body-secondary font-medium text-sam-fg">{t("admin_ops_tools_routines_month_wins")}</p>
              <p className="mt-1 sam-text-body-secondary text-sam-muted">{n.topWins}</p>
              {n.followUpFocus && (
                <>
                  <p className="mt-2 sam-text-body-secondary font-medium text-sam-fg">{t("admin_ops_tools_routines_month_followup")}</p>
                  <p className="mt-1 sam-text-body-secondary text-sam-muted">{n.followUpFocus}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
