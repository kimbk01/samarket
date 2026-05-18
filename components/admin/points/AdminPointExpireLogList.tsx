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

import type { PointExpireLog } from "@/lib/types/point-expire";
import type { PointExpireLogActionType } from "@/lib/types/point-expire";

interface AdminPointExpireLogListProps {
  logs: PointExpireLog[];
}

const EXPIRE_LOG_ACTION_KEYS: Record<
  PointExpireLogActionType,
  "admin_points_expire_log_preview" | "admin_points_expire_log_expire" | "admin_points_expire_log_rollback"
> = {
  preview: "admin_points_expire_log_preview",
  expire: "admin_points_expire_log_expire",
  rollback: "admin_points_expire_log_rollback",
};

export function AdminPointExpireLogList({ logs }: AdminPointExpireLogListProps) {
  const { t } = useI18n();

  if (logs.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted"> {t("admin_points_expire_logs_empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_type")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_user")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_expire_th_expired_p")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_expire_th_expire_date")}
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
              <td className="px-3 py-2.5 text-sam-fg">
                {t(EXPIRE_LOG_ACTION_KEYS[l.actionType])}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {l.userNickname} ({l.userId})
              </td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                -{l.expiredPoint}P
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(l.expiresAt).toLocaleDateString("ko-KR")}
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
