"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PointEventPolicy } from "@/lib/types/point-policy";

interface PointEventPolicyTableProps {
  policies: PointEventPolicy[];
  onEdit?: (policy: PointEventPolicy) => void;
  onToggleActive?: (id: string, isActive: boolean) => void;
}

export function PointEventPolicyTable({
  policies,
  onEdit,
  onToggleActive,
}: PointEventPolicyTableProps) {
  const { t } = useI18n();

  if (policies.length === 0) {
    return (
      <p className="sam-text-body text-sam-muted"> {t("admin_points_policy_event_empty")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-ui-rect border border-sam-border bg-sam-surface">
      <table className="w-full min-w-[560px] border-collapse sam-text-body">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app">
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_policy_event_title")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_policy_th_period")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_policy_th_multipliers")}
            </th>
            <th className="px-3 py-2.5 text-left font-medium text-sam-fg"> {t("admin_points_policy_th_target_boards")}
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
              <td className="px-3 py-2.5 font-medium text-sam-fg">
                {p.title}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {new Date(p.startAt).toLocaleDateString("ko-KR")} ~{" "}
                {new Date(p.endAt).toLocaleDateString("ko-KR")}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {p.writeMultiplier}x / {p.commentMultiplier}x
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {p.targetBoards.join(", ") || "-"}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${
                    p.isActive
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-sam-border-soft text-sam-muted"
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
