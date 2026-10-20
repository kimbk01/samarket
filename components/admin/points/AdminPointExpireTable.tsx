"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
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

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import type { PointExpireExecution } from "@/lib/types/point-expire";
import { POINT_EXPIRE_EXECUTION_STATUS_LABELS } from "@/lib/points/point-expire-utils";

interface AdminPointExpireTableProps {
  executions: PointExpireExecution[];
}

const STATUS_CLASS: Record<string, string> = {
  simulated: "bg-sam-surface-muted text-sam-fg",
  success: "bg-sam-success-soft text-sam-success",
  skipped: "bg-sam-warning-soft text-sam-warning",
  failed: "bg-sam-danger-soft text-sam-danger",
};

export function AdminPointExpireTable({
  executions,
}: AdminPointExpireTableProps) {
  const { t, language } = useI18n();

  if (executions.length === 0) {
    return <AdminEmptyState ko={language !== "en"} message={t("admin_points_expire_history_empty")} />;
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[640px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_expire_th_run_date")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_expire_th_target_user")}
            </th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg"> {t("admin_points_expire_th_expired_p")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_status")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_datetime")}
            </th>
          </tr>
        </thead>
        <tbody>
          {executions.map((e) => (
            <tr
              key={e.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 text-sam-fg">{e.executionDate}</td>
              <td className="px-3 py-2.5 text-sam-fg">
                {e.targetUserNickname} ({e.targetUserId})
              </td>
              <td className="px-3 py-2.5 text-right font-medium tabular-nums text-sam-fg">
                -{formatAdminNumber(e.expiredPoint)}P
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                    STATUS_CLASS[e.executionStatus] ?? "bg-sam-surface-muted text-sam-fg"
                  }`}
                >
                  {pointExpireExecStatusLabel(t, e.executionStatus)}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {formatAdminManilaDateTime(e.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
