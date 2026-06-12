"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PointReclaimPolicy } from "@/lib/types/point-execution";
import {
  POINT_RECLAIM_TRIGGER_LABELS,
  POINT_RECLAIM_MODE_LABELS,
} from "@/lib/point-executions/point-execution-utils";

interface PointReclaimPolicyTableProps {
  policies: PointReclaimPolicy[];
  onToggleActive?: (policy: PointReclaimPolicy) => void;
}

export function PointReclaimPolicyTable({
  policies,
  onToggleActive,
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
                {p.reclaimPercent}%
              </td>
              <td className="px-3 py-2.5">
                {onToggleActive ? (
                  <button
                    type="button"
                    onClick={() => onToggleActive(p)}
                    className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                      p.isActive
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-sam-border-soft text-sam-muted"
                    }`}
                  >
                    {p.isActive ? t("admin_points_status_active") : t("admin_points_status_inactive")}
                  </button>
                ) : (
                  <span
                    className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                      p.isActive
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-sam-border-soft text-sam-muted"
                    }`}
                  >
                    {p.isActive ? t("admin_points_status_active") : t("admin_points_status_inactive")}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
