"use client";

import { useState } from "react";
import type { ReportActionType } from "@/lib/types/daangn";
import { applyReportActionDaangn } from "@/lib/admin-reports/applyReportActionDaangn";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

const SANCTION_OPTIONS: { type: ReportActionType; labelKey: MessageKey }[] = [
  { type: "reject", labelKey: "admin_report_action_reject" },
  { type: "warn", labelKey: "admin_report_action_warn" },
  { type: "chat_ban", labelKey: "admin_report_action_chat_ban" },
  { type: "product_hide", labelKey: "admin_report_action_product_hide" },
  { type: "account_suspend", labelKey: "admin_report_sanction_btn_suspend" },
  { type: "account_ban", labelKey: "admin_report_sanction_btn_ban" },
];

interface AdminSanctionPanelProps {
  reportId: string;
  targetUserId: string;
  targetLabel?: string;
  onActionSuccess?: () => void;
}

/**
 * 신고 처리 제재 패널 — report_actions + reports 갱신 + sanctions 반영
 */
export function AdminSanctionPanel({
  reportId,
  targetUserId,
  targetLabel,
  onActionSuccess,
}: AdminSanctionPanelProps) {
  const { t } = useI18n();
  const [loading, setLoading] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (actionType: ReportActionType) => {
    setError(null);
    setLoading(actionType);
    const res = await applyReportActionDaangn(reportId, actionType, targetUserId, {
      actionNote: note.trim() || null,
    });
    setLoading(null);
    if (res.ok) {
      onActionSuccess?.();
    } else {
      setError(res.error);
    }
  };

  return (
    <div>
      {error && <p className="mb-2 sam-text-body-secondary text-red-600">{error}</p>}
      {targetLabel && (
        <p className="mb-3 sam-text-body text-sam-muted">
          {t("admin_report_sanction_target_label")}: <strong>{targetLabel}</strong> ({targetUserId || "—"})
        </p>
      )}
      <div className="mb-3">
        <label className="block sam-text-helper font-medium text-sam-muted">
          {t("admin_report_sanction_note_label")}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("admin_report_sanction_note_placeholder")}
          className="mt-1 w-full rounded border border-sam-border px-3 py-2 sam-text-body-secondary"
          rows={2}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {SANCTION_OPTIONS.map(({ type, labelKey }) => (
          <button
            key={type}
            type="button"
            disabled={loading !== null}
            onClick={() => handleAction(type)}
            className={`rounded border px-3 py-2 sam-text-body-secondary font-medium disabled:opacity-50 ${
              type === "reject"
                ? "border-sam-border bg-sam-surface text-sam-fg hover:bg-sam-app"
                : type === "account_ban"
                  ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                  : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
            }`}
          >
            {loading === type ? t("admin_report_sanction_processing") : t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
