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

import type { PointExpirePolicy } from "@/lib/types/point-expire";
import { POINT_EXPIRE_RUN_CYCLE_LABELS } from "@/lib/points/point-expire-utils";

interface AdminPointExpirePolicyCardProps {
  policy: PointExpirePolicy;
}

export function AdminPointExpirePolicyCard({
  policy,
}: AdminPointExpirePolicyCardProps) {
  const { t } = useI18n();

  return (
    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <h3 className="sam-text-body font-medium text-sam-fg">
        {policy.policyName}
      </h3>
      <dl className="mt-2 grid grid-cols-2 gap-2 sam-text-body sm:grid-cols-3">
        <div>
          <dt className="text-sam-muted">{t("admin_points_expire_label_days")}</dt>
          <dd>{t("admin_points_unit_days", { count: policy.expireAfterDays })}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_points_expire_label_exclude_types")}</dt>
          <dd>{policy.excludeEntryTypes.join(", ") || "-"}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_points_expire_label_run_cycle")}</dt>
          <dd>{pointExpireCycleLabel(t, policy.runCycle)}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_points_expire_label_auto_run")}</dt>
          <dd>{policy.autoExpireEnabled ? t("admin_points_status_active") : t("admin_points_status_inactive")}</dd>
        </div>
        <div>
          <dt className="text-sam-muted">{t("admin_points_expire_label_user_view")}</dt>
          <dd>{policy.allowUserView ? t("admin_points_allowed") : t("admin_points_denied")}</dd>
        </div>
      </dl>
      {policy.adminMemo && (
        <p className="mt-2 sam-text-body-secondary text-sam-muted">{policy.adminMemo}</p>
      )}
    </div>
  );
}
