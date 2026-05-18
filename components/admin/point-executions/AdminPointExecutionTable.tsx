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

import Link from "next/link";
import type { PointRewardExecution } from "@/lib/types/point-execution";
import {
  POINT_REWARD_ACTION_LABELS,
  POINT_EXECUTION_STATUS_LABELS,
} from "@/lib/point-executions/point-execution-utils";
import { getBoardName } from "@/lib/point-policies/point-policy-utils";
import { USER_TYPE_LABELS } from "@/lib/point-policies/point-policy-utils";

interface AdminPointExecutionTableProps {
  executions: PointRewardExecution[];
}

const STATUS_CLASS: Record<string, string> = {
  success: "bg-emerald-50 text-emerald-800",
  blocked: "bg-amber-100 text-amber-800",
  reversed: "bg-sam-border-soft text-sam-fg",
};

export function AdminPointExecutionTable({
  executions,
}: AdminPointExecutionTableProps) {
  const { t } = useI18n();

  if (executions.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted"> {t("admin_points_exec_history_empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[800px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">
              ID
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_board")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_action")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_target")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_user")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_points")}
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
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/point-executions/${e.id}`}
                  className="font-medium text-signature hover:underline"
                >
                  {e.id}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {pointBoardLabel(t, e.boardKey)}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {pointActionTypeLabel(t, e.actionType)}
              </td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-sam-muted">
                {e.targetType} {e.targetId}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {e.userNickname}
                <span className="ml-1 sam-text-helper text-sam-muted">
                  ({pointUserTypeLabel(t, e.userType)})
                </span>
              </td>
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {e.status === "success" ? `+${e.finalPoint}P` : "-"}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                    STATUS_CLASS[e.status] ?? "bg-sam-surface-muted text-sam-fg"
                  }`}
                >
                  {pointExecStatusLabel(t, e.status)}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(e.createdAt).toLocaleString("ko-KR")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
