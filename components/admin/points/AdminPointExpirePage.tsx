"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useAdminRouteAction } from "@/components/admin/access/use-admin-route-access";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { useAdminPointExpireData } from "@/hooks/useAdminPointExpireData";
import { AdminPointExpirePolicyCard } from "./AdminPointExpirePolicyCard";
import { AdminPointExpireTable } from "./AdminPointExpireTable";
import { AdminPointExpireRunPanel } from "./AdminPointExpireRunPanel";
import { AdminPointExpireLogList } from "./AdminPointExpireLogList";

export function AdminPointExpirePage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [refresh, setRefresh] = useState(0);
  const action = useAdminRouteAction("/admin/points/expire");
  const { policies, executions, logs, loading, error } = useAdminPointExpireData(refresh);
  const activePolicy = useMemo(
    () => policies.find((p) => p.isActive),
    [policies]
  );

  const totalExpired = useMemo(
    () => executions.reduce((s, e) => s + e.expiredPoint, 0),
    [executions]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_points_expire" />

      {!action.allowed && action.reason ? (
        <p className="sam-text-helper text-sam-muted" data-admin-action-denied="1">
          {ko ? `실행 버튼 비활성: ${action.reason}` : `Actions disabled: ${action.reason}`}
        </p>
      ) : null}

      {loading && policies.length === 0 && executions.length === 0 ? (
        <AdminLoadingState ko={ko} />
      ) : error ? (
        <AdminErrorState
          ko={ko}
          code={error.code}
          httpStatus={error.httpStatus}
          onRetry={() => setRefresh((r) => r + 1)}
        />
      ) : null}

      {activePolicy ? (
        <AdminCard titleKey="admin_points_expire_card_policy">
          <AdminPointExpirePolicyCard
            key={activePolicy.id}
            policy={activePolicy}
            actionAllowed={action.allowed}
            onSaved={() => setRefresh((r) => r + 1)}
          />
        </AdminCard>
      ) : !loading && !error ? (
        <AdminCard titleKey="admin_points_expire_card_policy">
          <p className="sam-text-body text-sam-muted"> {t("admin_points_expire_no_policy")}
          </p>
        </AdminCard>
      ) : null}

      <AdminCard titleKey="admin_points_expire_card_run">
        <AdminPointExpireRunPanel actionAllowed={action.allowed} onRunComplete={() => setRefresh((r) => r + 1)} />
      </AdminCard>

      {executions.length > 0 && (
        <AdminCard titleKey="admin_points_expire_card_summary">
          <div className="flex flex-wrap gap-4 sam-text-body">
            <div>
              <span className="text-sam-muted">{t("admin_points_expire_label_run_count")}</span>
              <span className="ml-2 font-medium text-sam-fg">
                {t("admin_points_unit_count", { count: executions.length })}
              </span>
            </div>
            <div>
              <span className="text-sam-muted">{t("admin_points_expire_label_total_expired_p")}</span>
              <span className="ml-2 font-medium tabular-nums text-sam-fg">
                {formatAdminNumber(totalExpired)}P
              </span>
            </div>
          </div>
        </AdminCard>
      )}

      <AdminCard titleKey="admin_points_expire_card_history">
        <AdminPointExpireTable executions={executions} />
      </AdminCard>

      <AdminCard titleKey="admin_points_expire_card_logs">
        <AdminPointExpireLogList logs={logs} />
      </AdminCard>
    </div>
  );
}
