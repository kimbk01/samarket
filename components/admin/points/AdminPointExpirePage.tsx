"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getPointExpirePolicies } from "@/lib/points/mock-point-expire-policies";
import { getPointExpireExecutions } from "@/lib/points/mock-point-expire-executions";
import { getPointExpireLogs } from "@/lib/points/mock-point-expire-logs";
import { AdminPointExpirePolicyCard } from "./AdminPointExpirePolicyCard";
import { AdminPointExpireTable } from "./AdminPointExpireTable";
import { AdminPointExpireRunPanel } from "./AdminPointExpireRunPanel";
import { AdminPointExpireLogList } from "./AdminPointExpireLogList";

export function AdminPointExpirePage() {
  const { t } = useI18n();
  const [refresh, setRefresh] = useState(0);
  const policies = useMemo(() => getPointExpirePolicies(), []);
  const activePolicy = useMemo(
    () => policies.find((p) => p.isActive),
    [policies]
  );
  const executions = useMemo(
    () => getPointExpireExecutions(),
    [refresh]
  );
  const logs = useMemo(() => getPointExpireLogs(), [refresh]);

  const totalExpired = useMemo(
    () => executions.reduce((s, e) => s + e.expiredPoint, 0),
    [executions]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_points_expire_page" />

      {activePolicy ? (
        <AdminCard titleKey="admin_points_expire_card_policy">
          <AdminPointExpirePolicyCard policy={activePolicy} />
        </AdminCard>
      ) : (
        <AdminCard titleKey="admin_points_expire_card_policy">
          <p className="sam-text-body text-sam-muted"> {t("admin_points_expire_no_policy")}
          </p>
        </AdminCard>
      )}

      <AdminCard titleKey="admin_points_expire_card_run">
        <AdminPointExpireRunPanel onRunComplete={() => setRefresh((r) => r + 1)} />
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
              <span className="ml-2 font-medium text-sam-fg">
                {totalExpired}P
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
