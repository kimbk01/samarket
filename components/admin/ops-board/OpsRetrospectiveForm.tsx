"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { addOpsRetrospective } from "@/lib/ops-board/ops-board-state";
import { persistOpsBoardToServer } from "@/lib/ops-board/ops-board-sync-client";
import type { OpsSurface } from "@/lib/types/ops-board";
import { OPS_TOOLS_SURFACE_KEYS } from "@/components/admin/i18n/admin-ops-tools-label-keys";

const SURFACE_OPTIONS: { value: OpsSurface; labelKey: MessageKey }[] = [
  { value: "all", labelKey: OPS_TOOLS_SURFACE_KEYS.all },
  { value: "home", labelKey: OPS_TOOLS_SURFACE_KEYS.home },
  { value: "search", labelKey: OPS_TOOLS_SURFACE_KEYS.search },
  { value: "shop", labelKey: OPS_TOOLS_SURFACE_KEYS.shop },
];

export function OpsRetrospectiveForm({
  onSaved,
}: {
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [wins, setWins] = useState("");
  const [issues, setIssues] = useState("");
  const [learnings, setLearnings] = useState("");
  const [nextActions, setNextActions] = useState("");
  const [relatedSurface, setRelatedSurface] = useState<OpsSurface>("all");
  const [relatedReportId, setRelatedReportId] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const date = new Date().toISOString().slice(0, 10);
    addOpsRetrospective({
      retrospectiveDate: date,
      title: title || t("admin_ops_tools_board_retro_default_title"),
      summary,
      wins,
      issues,
      learnings,
      nextActions,
      relatedSurface,
      relatedReportId: relatedReportId.trim() || null,
      createdAt: new Date().toISOString(),
      createdByAdminId: "admin1",
      createdByAdminNickname: t("admin_ops_tools_admin_nickname"),
    });
    setTitle("");
    setSummary("");
    setWins("");
    setIssues("");
    setLearnings("");
    setNextActions("");
    setRelatedReportId("");
    void persistOpsBoardToServer();
    onSaved?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <h3 className="sam-text-body font-medium text-sam-fg">{t("admin_ops_tools_board_retro_new")}</h3>
      <div>
        <label className="mb-1 block sam-text-helper text-sam-muted">{t("admin_ops_tools_board_label_title")}</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("admin_ops_tools_board_ph_title")}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-helper text-sam-muted">{t("admin_ops_tools_board_label_summary")}</label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-helper text-sam-muted">{t("admin_ops_tools_board_label_went_well")}</label>
        <textarea
          value={wins}
          onChange={(e) => setWins(e.target.value)}
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-helper text-sam-muted">{t("admin_ops_tools_board_label_issues")}</label>
        <textarea
          value={issues}
          onChange={(e) => setIssues(e.target.value)}
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div>
        <label className="mb-1 block sam-text-helper text-sam-muted">{t("admin_ops_tools_board_label_next_action")}</label>
        <textarea
          value={nextActions}
          onChange={(e) => setNextActions(e.target.value)}
          rows={2}
          className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block sam-text-helper text-sam-muted">{t("admin_ops_tools_board_label_surface")}</label>
          <select
            value={relatedSurface}
            onChange={(e) => setRelatedSurface(e.target.value as OpsSurface)}
            className="rounded border border-sam-border px-3 py-2 sam-text-body"
          >
            {SURFACE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block sam-text-helper text-sam-muted">{t("admin_ops_tools_board_label_report_id")}</label>
          <input
            type="text"
            value={relatedReportId}
            onChange={(e) => setRelatedReportId(e.target.value)}
            placeholder="rr-1"
            className="w-24 rounded border border-sam-border px-3 py-2 sam-text-body"
          />
        </div>
      </div>
      <button
        type="submit"
        className="rounded border border-signature bg-signature px-4 py-2 sam-text-body font-medium text-white"
      >
        {t("admin_ops_tools_board_save_retro")}
      </button>
    </form>
  );
}
