"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { pointRewardTypeLabel } from "@/components/admin/points/admin-points-notifications-i18n";

import type { BoardPointPolicy } from "@/lib/types/point-policy";
import { REWARD_TYPE_LABELS } from "@/lib/point-policies/point-policy-utils";

interface BoardPointPolicyTableProps {
  policies: BoardPointPolicy[];
  onEdit?: (policy: BoardPointPolicy) => void;
  onToggleActive?: (id: string, isActive: boolean) => void;
  /** 쓰기 권한 없음·처리 중 — 행 버튼 비활성 */
  actionsDisabled?: boolean;
}

export function BoardPointPolicyTable({
  policies,
  onEdit,
  onToggleActive,
  actionsDisabled = false,
}: BoardPointPolicyTableProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";

  if (policies.length === 0) {
    return <AdminEmptyState ko={language !== "en"} message={t("admin_points_policy_board_empty")} />;
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
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg"> {t("admin_points_policy_th_free_cap")}
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
              <td className="px-3 py-2.5 text-right tabular-nums text-sam-fg">
                {formatAdminNumber(p.maxFreeUserPointCap)}P
              </td>
              <td className="px-3 py-2.5">
                <AdminToneBadge tone={p.isActive ? "success" : "neutral"}>
                  {p.isActive ? t("admin_points_status_active") : t("admin_points_status_inactive")}
                </AdminToneBadge>
              </td>
              {(onEdit || onToggleActive) && (
                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                  {onEdit && (
                    <AdminActionButton variant="ghost" size="sm" disabled={actionsDisabled} onClick={() => onEdit(p)}>
                      {adminCta("edit", ko)}
                    </AdminActionButton>
                  )}
                  {onToggleActive && (
                    <AdminActionButton
                      variant="ghost"
                      size="sm"
                      disabled={actionsDisabled}
                      onClick={() => onToggleActive(p.id, !p.isActive)}
                    >
                      {p.isActive ? t("admin_points_status_inactive") : t("admin_points_status_active")}
                    </AdminActionButton>
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
