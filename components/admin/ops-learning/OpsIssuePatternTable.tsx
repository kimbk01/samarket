"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_SURFACE_KEYS,
  OPS_TOOLS_TREND_KEYS,
  OPS_TOOLS_PATTERN_STATUS_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo } from "react";
import Link from "next/link";
import type { OpsLearningStatus } from "@/lib/types/ops-learning";
import { getOpsIssuePatterns } from "@/lib/ops-learning/mock-ops-issue-patterns";

interface OpsIssuePatternTableProps {
  statusFilter?: OpsLearningStatus | "";
  onSelectPattern?: (patternId: string) => void;
}

export function OpsIssuePatternTable({
  statusFilter = "",
  onSelectPattern,
}: OpsIssuePatternTableProps) {
  const { t } = useI18n();
  const patterns = useMemo(
    () => getOpsIssuePatterns({ status: statusFilter || undefined }),
    [statusFilter]
  );

  if (patterns.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_learning_patterns_empty")}</div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_learning_th_pattern")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_learning_th_surface_type")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_learning_th_occurrence")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_learning_th_trend")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_learning_th_linked_doc")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_board_th_status")}</th>
          </tr>
        </thead>
        <tbody>
          {patterns.map((p) => (
            <tr
              key={p.id}
              className="border-b border-sam-border-soft hover:bg-sam-app cursor-pointer"
              onClick={() => onSelectPattern?.(p.id)}
            >
              <td className="px-3 py-2.5">
                <span className="font-medium text-sam-fg">{p.title}</span>
                <p className="sam-text-helper text-sam-muted">{p.patternKey}</p>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {t(opsToolsLabel(OPS_TOOLS_SURFACE_KEYS, p.surface))} · {p.incidentType}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {p.occurrenceCount}회
                {p.avgResolutionMinutes != null && ` / 약 ${p.avgResolutionMinutes}분`}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {t(opsToolsLabel(OPS_TOOLS_TREND_KEYS, p.severityTrend))}
              </td>
              <td className="px-3 py-2.5">
                {p.linkedDocumentId ? (
                  <Link
                    href={`/admin/ops-docs/${p.linkedDocumentId}`}
                    className="text-signature hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {p.linkedDocumentId}
                  </Link>
                ) : (
                  "-"
                )}
              </td>
              <td className="px-3 py-2.5">
                <span className="rounded bg-sam-surface-muted px-2 py-0.5 sam-text-helper text-sam-fg">
                  {t(opsToolsLabel(OPS_TOOLS_PATTERN_STATUS_KEYS, p.status))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
