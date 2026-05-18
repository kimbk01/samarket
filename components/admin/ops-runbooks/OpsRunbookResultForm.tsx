"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useState } from "react";
import type {
  OpsRunbookOutcomeType,
  OpsRunbookSeverityAfter,
} from "@/lib/types/ops-runbook";
import { getOpsRunbookResults } from "@/lib/ops-runbooks/mock-ops-runbook-results";
import { writeRunbookResult } from "@/lib/ops-runbooks/ops-runbook-utils";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  OPS_TOOLS_PRIORITY_KEYS,
  OPS_TOOLS_RESULT_OUTCOME_KEYS,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";

const OUTCOME_OPTIONS: { value: OpsRunbookOutcomeType; labelKey: MessageKey }[] = [
  { value: "resolved", labelKey: OPS_TOOLS_RESULT_OUTCOME_KEYS.resolved },
  { value: "mitigated", labelKey: OPS_TOOLS_RESULT_OUTCOME_KEYS.mitigated },
  { value: "rolled_back", labelKey: OPS_TOOLS_RESULT_OUTCOME_KEYS.rolled_back },
  { value: "fallback_applied", labelKey: OPS_TOOLS_RESULT_OUTCOME_KEYS.fallback_applied },
  { value: "monitoring_only", labelKey: OPS_TOOLS_RESULT_OUTCOME_KEYS.monitoring_only },
  { value: "escalated", labelKey: OPS_TOOLS_RESULT_OUTCOME_KEYS.escalated },
];

const SEVERITY_OPTIONS: { value: OpsRunbookSeverityAfter; labelKey: MessageKey }[] = [
  { value: "low", labelKey: OPS_TOOLS_PRIORITY_KEYS.low },
  { value: "medium", labelKey: OPS_TOOLS_PRIORITY_KEYS.medium },
  { value: "high", labelKey: OPS_TOOLS_PRIORITY_KEYS.high },
  { value: "critical", labelKey: OPS_TOOLS_PRIORITY_KEYS.critical },
];

const ADMIN_ID = "admin1";
interface OpsRunbookResultFormProps {
  executionId: string;
  onSaved?: () => void;
}

export function OpsRunbookResultForm({
  executionId,
  onSaved,
}: OpsRunbookResultFormProps) {
  const { t } = useI18n();
  const adminNickname = t("admin_ops_tools_admin_nickname");
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
      adminNickname
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
          <h3 className="sam-text-body font-medium text-sam-fg">{t("admin_ops_tools_runbook_existing_result")}</h3>
          <ul className="mt-2 space-y-2 sam-text-body-secondary text-sam-fg">
            {existingResults.map((r) => (
              <li key={r.id}>
                {r.outcomeType} · {r.severityAfter} · {r.summary}
                {r.followupNeeded && t("admin_ops_tools_runbook_followup_flag")}
              </li>
            ))}
          </ul>
        </div>
      )}
      <form onSubmit={handleSubmit} className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="mb-3 sam-text-body font-medium text-sam-fg">{t("admin_ops_tools_runbook_card_result")}</h3>
        <p className="mb-3 sam-text-helper text-sam-muted">{t("admin_ops_tools_runbook_followup_hint")}</p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block sam-text-helper text-sam-fg">{t("admin_ops_tools_runbook_outcome_type")}</label>
            <select
              value={outcomeType}
              onChange={(e) => setOutcomeType(e.target.value as OpsRunbookOutcomeType)}
              className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
            >
              {OUTCOME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block sam-text-helper text-sam-fg">{t("admin_ops_tools_runbook_severity_after")}</label>
            <select
              value={severityAfter}
              onChange={(e) => setSeverityAfter(e.target.value as OpsRunbookSeverityAfter)}
              className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
            >
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.labelKey)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block sam-text-helper text-sam-fg">{t("admin_ops_tools_board_label_summary")}</label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              required
              className="w-full rounded border border-sam-border px-3 py-2 sam-text-body"
            />
          </div>
          <div>
            <label className="mb-1 block sam-text-helper text-sam-fg">{t("admin_ops_tools_runbook_root_cause")}</label>
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
            />{t("admin_ops_tools_runbook_followup_check")}</label>
        </div>
        <button
          type="submit"
          className="mt-4 rounded border border-signature bg-signature px-4 py-2 sam-text-body font-medium text-white"
        >{t("admin_ops_tools_rb_log_result")}</button>
      </form>
    </div>
  );
}
