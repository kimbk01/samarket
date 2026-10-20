"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { pointBoardLabel } from "@/components/admin/points/admin-points-notifications-i18n";

import type { PointRewardLog } from "@/lib/types/point-execution";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminTechId } from "@/components/admin/ui/AdminTechId";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

interface PointRewardLogListProps {
  logs: PointRewardLog[];
}

export function PointRewardLogList({ logs }: PointRewardLogListProps) {
  const { t } = useI18n();

  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted"> {t("admin_points_exec_logs_empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_type")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_board")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_target")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_user")}
            </th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg"> {t("admin_points_th_points")}
            </th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg"> {t("admin_points_th_balance")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_datetime")}
            </th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr
              key={l.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5">
                <AdminToneBadge tone={l.actionType === "reward" ? "success" : "warning"}>
                  {l.actionType === "reward"
                    ? t("admin_points_reward_log_reward")
                    : t("admin_points_reward_log_reclaim")}
                </AdminToneBadge>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {pointBoardLabel(t, l.boardKey)}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-sam-muted">
                {l.targetType === "comment" ? t("admin_points_target_comment") : t("admin_points_target_post")}{" "}
                {l.targetId}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                <AdminTechId id={l.userId} />
              </td>
              <td
                className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                  l.pointAmount >= 0 ? "text-sam-success" : "text-sam-warning"
                }`}
              >
                {l.pointAmount >= 0 ? "+" : ""}
                {formatAdminNumber(l.pointAmount)}P
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-sam-fg">
                {formatAdminNumber(l.balanceAfter)}P
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
