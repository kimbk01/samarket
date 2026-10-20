"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  pointActionTypeLabel,
  pointBoardLabel,
  pointExecStatusLabel,
  pointUserTypeLabel,
} from "@/components/admin/points/admin-points-notifications-i18n";

import Link from "next/link";
import type { PointRewardExecution } from "@/lib/types/point-execution";
import { AdminToneBadge, type AdminTone } from "@/components/admin/ui/AdminToneBadge";
import { formatAdminShortId } from "@/components/admin/ui/AdminTechId";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";

interface AdminPointExecutionTableProps {
  executions: PointRewardExecution[];
}

const STATUS_TONE: Record<string, AdminTone> = {
  success: "success",
  blocked: "warning",
  reversed: "neutral",
};

export function AdminPointExecutionTable({ executions }: AdminPointExecutionTableProps) {
  const { t } = useI18n();

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[800px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">ID</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_points_th_board")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_points_th_action")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_points_th_target")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_points_th_user")}</th>
            <th className="px-3 py-2.5 text-right font-medium text-sam-fg">{t("admin_points_th_points")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_points_th_status")}</th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg">{t("admin_points_th_datetime")}</th>
          </tr>
        </thead>
        <tbody>
          {executions.map((e) => (
            <tr key={e.id} className="border-b border-sam-border-soft hover:bg-sam-app">
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/point-executions/${e.id}`}
                  className="font-mono font-medium text-sam-primary hover:underline"
                  title={e.id}
                >
                  {formatAdminShortId(e.id)}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-sam-fg">{pointBoardLabel(t, e.boardKey)}</td>
              <td className="px-3 py-2.5 text-sam-fg">{pointActionTypeLabel(t, e.actionType)}</td>
              <td className="max-w-[120px] truncate px-3 py-2.5 text-sam-muted">
                {e.targetType === "comment" ? t("admin_points_target_comment") : t("admin_points_target_post")}{" "}
                {e.targetId}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {e.userNickname}
                <span className="ml-1 sam-text-helper text-sam-muted">({pointUserTypeLabel(t, e.userType)})</span>
              </td>
              <td className="px-3 py-2.5 text-right font-medium tabular-nums text-sam-fg">
                {e.status === "success" ? `+${formatAdminNumber(e.finalPoint)}P` : "-"}
              </td>
              <td className="px-3 py-2.5">
                <AdminToneBadge tone={STATUS_TONE[e.status] ?? "neutral"}>
                  {pointExecStatusLabel(t, e.status)}
                </AdminToneBadge>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary tabular-nums text-sam-muted">
                {formatAdminManilaDateTime(e.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
