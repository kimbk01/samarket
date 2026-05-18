"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OpsActionItem } from "@/lib/types/ops-board";
import { updateOpsActionItem } from "@/lib/ops-board/mock-ops-action-items";
import {
  OPS_TOOLS_ACTION_SOURCE_KEYS,
  OPS_TOOLS_ACTION_STATUS_KEYS,
  OPS_TOOLS_PRIORITY_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";

interface OpsActionCardProps {
  item: OpsActionItem;
  onUpdate?: () => void;
}

export function OpsActionCard({ item, onUpdate }: OpsActionCardProps) {
  const { t } = useI18n();
  const isOverdue =
    item.dueDate &&
    item.dueDate < new Date().toISOString().slice(0, 10) &&
    item.status !== "done" &&
    item.status !== "archived";

  const handleStatusChange = (status: OpsActionItem["status"]) => {
    updateOpsActionItem(item.id, { status });
    onUpdate?.();
  };

  return (
    <div
      className={`rounded-ui-rect border p-4 ${
        isOverdue ? "border-red-200 bg-red-50/50" : "border-sam-border bg-sam-surface"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-sam-fg">{item.title}</h3>
          <p className="mt-1 sam-text-body-secondary text-sam-muted">{item.description}</p>
          <div className="mt-2 flex flex-wrap gap-2 sam-text-helper text-sam-muted">
            <span>{t(opsToolsLabel(OPS_TOOLS_ACTION_SOURCE_KEYS, item.sourceType))}</span>
            <span>{t(opsToolsLabel(OPS_TOOLS_PRIORITY_KEYS, item.priority))}</span>
            {item.dueDate && (
              <span className={isOverdue ? "font-medium text-red-600" : ""}>
                {t("admin_ops_tools_board_due", { date: item.dueDate })}
                {isOverdue ? t("admin_ops_tools_board_overdue_suffix") : ""}
              </span>
            )}
            {item.ownerAdminNickname && (
              <span>{t("admin_ops_tools_board_owner", { name: item.ownerAdminNickname })}</span>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 sam-text-helper ${
            item.status === "done"
              ? "bg-emerald-50 text-emerald-800"
              : item.status === "in_progress"
                ? "bg-amber-50 text-amber-800"
                : "bg-sam-surface-muted text-sam-muted"
          }`}
        >
          {t(opsToolsLabel(OPS_TOOLS_ACTION_STATUS_KEYS, item.status))}
        </span>
      </div>
      {item.status !== "done" && item.status !== "archived" && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => handleStatusChange("in_progress")}
            className="rounded border border-amber-200 bg-amber-50 px-2 py-1 sam-text-helper text-amber-800"
          >
            {t("admin_ops_tools_board_btn_progress")}
          </button>
          <button
            type="button"
            onClick={() => handleStatusChange("done")}
            className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 sam-text-helper text-emerald-800"
          >
            {t("admin_ops_tools_board_btn_complete")}
          </button>
        </div>
      )}
    </div>
  );
}
