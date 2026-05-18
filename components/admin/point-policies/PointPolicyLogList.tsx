"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { PointPolicyLog } from "@/lib/types/point-policy";

interface PointPolicyLogListProps {
  logs: PointPolicyLog[];
}

export function PointPolicyLogList({ logs }: PointPolicyLogListProps) {
  const { t } = useI18n();

  const policyTypeLabels: Record<PointPolicyLog["policyType"], string> = {
    board_policy: t("admin_points_policy_log_type_board"),
    probability_rule: t("admin_points_policy_log_type_probability"),
    event_policy: t("admin_points_policy_log_type_event"),
  };

  const actionLabels: Record<PointPolicyLog["actionType"], string> = {
    create: t("admin_points_policy_log_action_create"),
    update: t("admin_points_policy_log_action_update"),
    activate: t("admin_points_policy_log_action_activate"),
    deactivate: t("admin_points_policy_log_action_deactivate"),
    simulate: t("admin_points_policy_log_action_simulate"),
  };

  if (logs.length === 0) {
    return (
      <p className="sam-text-body text-sam-muted">{t("admin_points_policy_log_empty")}</p>
    );
  }

  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li
          key={log.id}
          className="flex flex-wrap items-baseline gap-2 border-b border-sam-border-soft pb-2 sam-text-body-secondary last:border-0"
        >
          <span className="font-medium text-sam-fg">
            {policyTypeLabels[log.policyType]}
          </span>
          <span className="text-sam-muted">
            {actionLabels[log.actionType]}
          </span>
          <span className="text-sam-muted">{log.note}</span>
          <span className="text-sam-muted">{log.adminNickname}</span>
          <span className="ml-auto text-sam-meta">
            {new Date(log.createdAt).toLocaleString("ko-KR")}
          </span>
        </li>
      ))}
    </ul>
  );
}
