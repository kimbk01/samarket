"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  pointActionTypeLabel,
  pointBoardLabel,
  pointChargeStatusLabel,
  pointExecStatusLabel,
  pointExpireCycleLabel,
  pointExpireExecStatusLabel,
  pointLedgerTypeLabel,
  pointPaymentMethodLabel,
  pointRewardTypeLabel,
  pointUserTypeLabel,
} from "@/components/admin/points/admin-points-notifications-i18n";

import type { BoardPointPolicy } from "@/lib/types/point-policy";
import { REWARD_TYPE_LABELS } from "@/lib/point-policies/point-policy-utils";

interface BoardPointPolicyTableProps {
  policies: BoardPointPolicy[];
  onEdit?: (policy: BoardPointPolicy) => void;
  onToggleActive?: (id: string, isActive: boolean) => void;
}

export function BoardPointPolicyTable({
  policies,
  onEdit,
  onToggleActive,
}: BoardPointPolicyTableProps) {
  const { t } = useI18n();

  if (policies.length === 0) {
    return (
      <p className="sam-text-body text-sam-muted"> {t("admin_points_policy_board_empty")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_board")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_policy_th_write")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_policy_th_comment")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_exec_block_cooldown")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_policy_th_free_cap")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_status")}
            </th>
            {(onEdit || onToggleActive) && (
              <th className="px-3 py-2.5 text-right font-medium text-sam-fg"> {t("admin_points_th_work")}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr
              key={p.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5">
                <span className="font-medium text-sam-fg">{p.boardName}</span>
                <span className="ml-1 sam-text-helper text-sam-muted">
                  ({p.boardKey})
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {pointRewardTypeLabel(t, p.writeRewardType)}
                {p.writeRewardType === "fixed"
                  ? ` ${p.writeFixedPoint}P`
                  : ` ${p.writeRandomMin}~${p.writeRandomMax}P`}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {pointRewardTypeLabel(t, p.commentRewardType)}
                {p.commentRewardType === "fixed"
                  ? ` ${p.commentFixedPoint}P`
                  : ` ${p.commentRandomMin}~${p.commentRandomMax}P`}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {t("admin_points_policy_cooldown_line", {
                  writeSec: p.writeCooldownSeconds,
                  commentSec: p.commentCooldownSeconds,
                })}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {p.maxFreeUserPointCap}P
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                    p.isActive ? "bg-emerald-50 text-emerald-800" : "bg-sam-border-soft text-sam-muted"
                  }`}
                >
                  {p.isActive ? t("admin_points_status_active") : t("admin_points_status_inactive")}
                </span>
              </td>
              {(onEdit || onToggleActive) && (
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  {onEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit(p)}
                      className="mr-1 sam-text-body-secondary text-signature hover:underline"
                    >
                      {t("common_edit")}
                    </button>
                  )}
                  {onToggleActive && (
                    <button
                      type="button"
                      onClick={() => onToggleActive(p.id, !p.isActive)}
                      className="sam-text-body-secondary text-sam-muted hover:underline"
                    >
                      {p.isActive ? t("admin_points_status_inactive") : t("admin_points_status_active")}
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
