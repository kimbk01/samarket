"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PointReclaimPolicy } from "@/lib/types/point-execution";
import {
  POINT_RECLAIM_TRIGGER_LABELS,
  POINT_RECLAIM_MODE_LABELS,
} from "@/lib/point-executions/point-execution-utils";
import { AdminChipButton } from "@/components/admin/ui/AdminChipButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";

interface PointReclaimPolicyTableProps {
  policies: PointReclaimPolicy[];
  onToggleActive?: (policy: PointReclaimPolicy) => void;
  /** 쓰기 권한 없음·처리 중 — 토글 비활성 */
  toggleDisabled?: boolean;
}

export function PointReclaimPolicyTable({
  policies,
  onToggleActive,
  toggleDisabled = false,
}: PointReclaimPolicyTableProps) {
  const { t } = useI18n();

  if (policies.length === 0) {
    return (
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted"> {t("admin_points_exec_reclaim_empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[480px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_target")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_exec_th_trigger")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_exec_th_reclaim_mode")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_exec_th_ratio")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_th_status")}
            </th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr
              key={p.id}
              className="border-b border-sam-border-soft hover:bg-sam-app"
            >
              <td className="px-3 py-2.5 text-sam-fg">
                {p.targetType === "post"
                  ? t("admin_points_target_post")
                  : t("admin_points_target_comment")}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {POINT_RECLAIM_TRIGGER_LABELS[p.triggerType]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {POINT_RECLAIM_MODE_LABELS[p.reclaimMode]}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                <span className="tabular-nums">{p.reclaimPercent}%</span>
              </td>
              <td className="px-3 py-2.5">
                {onToggleActive ? (
                  <AdminChipButton
                    selected={p.isActive}
                    disabled={toggleDisabled}
                    onClick={() => onToggleActive(p)}
                  >
                    {p.isActive ? t("admin_points_status_active") : t("admin_points_status_inactive")}
                  </AdminChipButton>
                ) : (
                  <AdminToneBadge tone={p.isActive ? "success" : "neutral"}>
                    {p.isActive ? t("admin_points_status_active") : t("admin_points_status_inactive")}
                  </AdminToneBadge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
