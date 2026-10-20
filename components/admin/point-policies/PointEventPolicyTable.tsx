"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import type { PointEventPolicy } from "@/lib/types/point-policy";
import { formatAdminManilaDate } from "@/lib/admin/metrics/manila-period";

interface PointEventPolicyTableProps {
  policies: PointEventPolicy[];
  onEdit?: (policy: PointEventPolicy) => void;
  onToggleActive?: (id: string, isActive: boolean) => void;
  /** 쓰기 권한 없음·처리 중 — 행 버튼 비활성 */
  actionsDisabled?: boolean;
}

export function PointEventPolicyTable({
  policies,
  onEdit,
  onToggleActive,
  actionsDisabled = false,
}: PointEventPolicyTableProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";

  if (policies.length === 0) {
    return <AdminEmptyState ko={language !== "en"} message={t("admin_points_policy_event_empty")} />;
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
                {formatAdminManilaDate(p.startAt)} ~{" "}
                {formatAdminManilaDate(p.endAt)}
              </td>
              <td className="px-3 py-2.5 text-sam-fg">
                {p.writeMultiplier}x / {p.commentMultiplier}x
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {p.targetBoards.join(", ") || "-"}
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
