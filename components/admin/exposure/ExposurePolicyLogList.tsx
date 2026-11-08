"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { ExposurePolicyLog } from "@/lib/types/exposure";
import { SURFACE_LABELS } from "@/lib/exposure/exposure-score-utils";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

const ACTION_LABEL_KEYS: Record<string, MessageKey> = {
  create: "admin_exposure_log_action_create",
  update: "admin_exposure_log_action_update",
  activate: "admin_exposure_log_action_activate",
  deactivate: "admin_exposure_log_action_deactivate",
  simulate: "admin_exposure_log_action_simulate",
};

interface ExposurePolicyLogListProps {
  logs: ExposurePolicyLog[];
}

export function ExposurePolicyLogList({ logs }: ExposurePolicyLogListProps) {
  const { t } = useI18n();
  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
        {t("admin_exposure_log_empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[480px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_exposure_log_col_policy_id")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              surface
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_exposure_log_col_action")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_exposure_log_col_admin")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_exposure_log_col_note")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              {t("admin_exposure_log_col_time")}
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr
              key={l.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 text-sam-fg">{l.policyId}</td>
              <td className="px-3 py-2.5 text-sam-fg">
                {SURFACE_LABELS[l.surface]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {ACTION_LABEL_KEYS[l.actionType] ? t(ACTION_LABEL_KEYS[l.actionType]) : l.actionType}
              </td>
              <td className="px-3 py-2.5 text-sam-muted">{l.adminNickname}</td>
              <td className="max-w-[200px] truncate px-3 py-2.5 text-sam-muted">
                {l.note}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {formatAdminManilaDateTime(l.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
