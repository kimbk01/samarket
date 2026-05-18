"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_KB_SOURCE_KEYS,
  OPS_TOOLS_LEARNING_TYPE_KEYS,
  OPS_TOOLS_PATTERN_STATUS_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo } from "react";
import type { OpsLearningStatus } from "@/lib/types/ops-learning";
import { getOpsLearningHistories } from "@/lib/ops-learning/mock-ops-learning-histories";

interface OpsLearningHistoryTableProps {
  statusFilter?: OpsLearningStatus | "";
}

export function OpsLearningHistoryTable({ statusFilter = "" }: OpsLearningHistoryTableProps) {
  const { t } = useI18n();
  const histories = useMemo(
    () => getOpsLearningHistories({ status: statusFilter || undefined }),
    [statusFilter]
  );

  if (histories.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-8 text-center sam-text-body text-sam-muted">{t("admin_ops_tools_learning_history_empty")}</div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[600px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_board_th_title")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_learning_th_source")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_learning_th_type")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_board_th_status")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_learning_th_detected")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_ops_tools_board_th_owner")}</th>
          </tr>
        </thead>
        <tbody>
          {histories.map((h) => (
            <tr key={h.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5">
                <span className="font-medium text-sam-fg">{h.title}</span>
                <p className="mt-0.5 sam-text-helper text-sam-muted line-clamp-1">{h.summary}</p>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {t(opsToolsLabel(OPS_TOOLS_KB_SOURCE_KEYS, h.sourceType))}
                {h.sourceId && ` · ${h.sourceId}`}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {t(opsToolsLabel(OPS_TOOLS_LEARNING_TYPE_KEYS, h.learningType))}
              </td>
              <td className="px-3 py-2.5">
                <span className="rounded bg-sam-surface-muted px-2 py-0.5 sam-text-helper text-sam-fg">
                  {t(opsToolsLabel(OPS_TOOLS_PATTERN_STATUS_KEYS, h.status))}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-muted">
                {new Date(h.detectedAt).toLocaleDateString("ko-KR")}
              </td>
              <td className="px-3 py-2.5 text-sam-muted">
                {h.ownerAdminNickname ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
