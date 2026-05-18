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

import type { PointRewardLog } from "@/lib/types/point-execution";

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
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_points")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_balance")}
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
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                    l.actionType === "reward"
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {l.actionType === "reward"
                    ? t("admin_points_reward_log_reward")
                    : t("admin_points_reward_log_reclaim")}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {pointBoardLabel(t, l.boardKey)}
              </td>
              <td className="max-w-[120px) truncate px-3 py-2.5 text-sam-muted">
                {l.targetType} {l.targetId}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{l.userId}</td>
              <td
                className={`px-3 py-2.5 font-medium ${
                  l.pointAmount >= 0 ? "text-emerald-600" : "text-amber-700"
                }`}
              >
                {l.pointAmount >= 0 ? "+" : ""}
                {l.pointAmount}P
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {l.balanceAfter}P
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(l.createdAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
