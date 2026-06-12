"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_RESOLUTION_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo } from "react";
import Link from "next/link";
import { getOpsResolutionCases } from "@/lib/ops-knowledge-graph/ops-knowledge-graph-state";
import { getOpsDocumentById } from "@/lib/ops-docs/ops-docs-state";

export function OpsResolutionCaseTable() {
  const { t } = useI18n();
  const cases = useMemo(() => getOpsResolutionCases(), []);

  if (cases.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_kg_resolution_empty")}</div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_issue")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_primary_doc")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_runbook")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_kg_th_result")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_rb_log_note")}</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => {
            const doc = getOpsDocumentById(c.primaryDocumentId);
            return (
              <tr key={c.id} className="border-b border-sam-border-soft hover:bg-sam-app">
                <td className="px-3 py-2.5 text-sam-fg">{c.incidentId}</td>
                <td className="px-3 py-2.5">
                  <Link
                    href={`/admin/ops-docs/${c.primaryDocumentId}`}
                    className="font-medium text-signature hover:underline"
                  >
                    {doc?.title ?? c.primaryDocumentId}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-sam-muted">
                  {c.relatedRunbookExecutionId ? (
                    <Link
                      href={`/admin/ops-runbooks/${c.relatedRunbookExecutionId}`}
                      className="text-signature hover:underline"
                    >
                      {c.relatedRunbookExecutionId}
                    </Link>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-3 py-2.5 text-sam-fg">
                  {t(opsToolsLabel(OPS_TOOLS_RESOLUTION_KEYS, c.outcomeType))}
                </td>
                <td className="px-3 py-2.5 text-sam-muted sam-text-body-secondary max-w-[200px] truncate">
                  {c.note || "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
