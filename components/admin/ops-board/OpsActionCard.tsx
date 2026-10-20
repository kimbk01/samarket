"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { OpsActionItem } from "@/lib/types/ops-board";
import { updateOpsActionItem } from "@/lib/ops-board/ops-board-state";
import { commitOpsBoardChange } from "@/lib/ops-board/ops-board-sync-client";
import { AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import {
  OPS_TOOLS_ACTION_SOURCE_KEYS,
  OPS_TOOLS_ACTION_STATUS_KEYS,
  OPS_TOOLS_PRIORITY_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { formatAdminManilaDate } from "@/lib/admin/metrics/manila-period";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

interface OpsActionCardProps {
  item: OpsActionItem;
  onUpdate?: () => void;
}

export function OpsActionCard({ item, onUpdate }: OpsActionCardProps) {
  const { t, language } = useI18n();
  const [busy, setBusy] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: false; code: string } | null>(null);
  const isOverdue =
    item.dueDate &&
    item.dueDate < formatAdminManilaDate(new Date()) &&
    item.status !== "done" &&
    item.status !== "archived";

  /** 저장 실패 → 화면 상태 되돌림 + 실패 문구 (예전: 실패해도 바뀐 상태가 남음). */
  const handleStatusChange = async (status: OpsActionItem["status"]) => {
    setBusy(true);
    const r = await commitOpsBoardChange(() => updateOpsActionItem(item.id, { status }));
    setBusy(false);
    setSaveResult(r.ok ? null : { ok: false, code: r.error ?? "save_failed" });
    onUpdate?.();
  };

  return (
    <div
      className={`rounded-ui-rect border p-4 ${
        isOverdue ? "border-sam-danger bg-sam-danger-soft" : "border-sam-border bg-sam-surface"
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
              <span className={isOverdue ? "font-medium text-sam-danger" : ""}>
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
              ? "bg-sam-success-soft text-sam-success"
              : item.status === "in_progress"
                ? "bg-sam-warning-soft text-sam-warning"
                : "bg-sam-surface-muted text-sam-muted"
          }`}
        >
          {t(opsToolsLabel(OPS_TOOLS_ACTION_STATUS_KEYS, item.status))}
        </span>
      </div>
      {saveResult ? (
        <div className="mt-3">
          <AdminResultBanner ko={language !== "en"} result={saveResult} onClose={() => setSaveResult(null)} />
        </div>
      ) : null}
      {item.status !== "done" && item.status !== "archived" && (
        <div className="mt-3 flex gap-2">
          <AdminActionButton
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void handleStatusChange("in_progress")}
          >
            {t("admin_ops_tools_board_btn_progress")}
          </AdminActionButton>
          <AdminActionButton
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => void handleStatusChange("done")}
          >
            {t("admin_ops_tools_board_btn_complete")}
          </AdminActionButton>
        </div>
      )}
    </div>
  );
}
