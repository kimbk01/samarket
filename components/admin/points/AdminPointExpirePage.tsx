"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMemo, useState } from "react";
import { MemberOpsListBody } from "@/components/admin/member-ops/MemberOpsListBody";
import { useMemberOpsPagedFetch } from "@/lib/admin/member-ops-list/use-member-ops-paged-fetch";
import { ADMIN_LIST_QUERY_DEFAULT_SIZE, type AdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import type { PointExpireExecution, PointExpireLog } from "@/lib/types/point-expire";
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
  const { policies, summary, loading, loaded, error } = useAdminPointExpireData(refresh);
  const activePolicy = useMemo(
    () => policies.find((p) => p.isActive),
    [policies]
  );

  /** 실행 이력·소멸 로그 — 서버 페이지 (예전 100건·200건 고정 상한 제거). 필터가 없어 쪽·크기만 화면 상태. */
  const [runPage, setRunPage] = useState(1);
  const [runSize, setRunSize] = useState<AdminListPageSize>(ADMIN_LIST_QUERY_DEFAULT_SIZE);
  const runs = useMemberOpsPagedFetch<PointExpireExecution>(
    `/api/admin/point-expire?view=executions&limit=${runSize}&offset=${(runPage - 1) * runSize}`,
    "executions",
    refresh
  );
  const [logPage, setLogPage] = useState(1);
  const [logSize, setLogSize] = useState<AdminListPageSize>(ADMIN_LIST_QUERY_DEFAULT_SIZE);
  const logs = useMemberOpsPagedFetch<PointExpireLog>(
    `/api/admin/point-expire?view=logs&limit=${logSize}&offset=${(logPage - 1) * logSize}`,
    "logs",
    refresh
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_points_expire" />

      {!action.allowed && action.reason ? (
        <p className="sam-text-helper text-sam-muted" data-admin-action-denied="1">
          {ko ? `실행 버튼 비활성: ${action.reason}` : `Actions disabled: ${action.reason}`}
        </p>
      ) : null}

      {error ? (
        <AdminErrorState
          ko={ko}
          code={error.code}
          httpStatus={error.httpStatus}
          onRetry={() => setRefresh((r) => r + 1)}
        />
      ) : !loaded && loading ? (
        <AdminLoadingState ko={ko} />
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
      ) : loaded && !error ? (
        <AdminCard titleKey="admin_points_expire_card_policy">
          <p className="sam-text-body text-sam-muted"> {t("admin_points_expire_no_policy")}
          </p>
        </AdminCard>
      ) : null}

      <AdminCard titleKey="admin_points_expire_card_run">
        <AdminPointExpireRunPanel actionAllowed={action.allowed} onRunComplete={() => setRefresh((r) => r + 1)} />
      </AdminCard>

      {summary && summary.runCount > 0 && (
        <AdminCard titleKey="admin_points_expire_card_summary">
          <div className="flex flex-wrap gap-4 sam-text-body">
            <div>
              <span className="text-sam-muted">{t("admin_points_expire_label_run_count")}</span>
              <span className="ml-2 font-medium text-sam-fg">
                {t("admin_points_unit_count", { count: formatAdminNumber(summary.runCount) })}
              </span>
            </div>
            <div>
              <span className="text-sam-muted">{t("admin_points_expire_label_total_expired_p")}</span>
              <span className="ml-2 font-medium tabular-nums text-sam-fg">
                {formatAdminNumber(summary.totalExpired)}P
              </span>
            </div>
          </div>
        </AdminCard>
      )}

      <AdminCard titleKey="admin_points_expire_card_history">
        <MemberOpsListBody
          ko={ko}
          loading={runs.loading}
          loaded={runs.loaded}
          error={runs.error}
          onRetry={runs.reload}
          rowCount={runs.rows.length}
          total={runs.total}
          page={runPage}
          size={runSize}
          onPageChange={setRunPage}
          onSizeChange={(n) => {
            setRunSize(n);
            setRunPage(1);
          }}
          emptyMessage={t("admin_points_expire_history_empty")}
        >
          <AdminPointExpireTable executions={runs.rows} />
        </MemberOpsListBody>
      </AdminCard>

      <AdminCard titleKey="admin_points_expire_card_logs">
        <MemberOpsListBody
          ko={ko}
          loading={logs.loading}
          loaded={logs.loaded}
          error={logs.error}
          onRetry={logs.reload}
          rowCount={logs.rows.length}
          total={logs.total}
          page={logPage}
          size={logSize}
          onPageChange={setLogPage}
          onSizeChange={(n) => {
            setLogSize(n);
            setLogPage(1);
          }}
          emptyMessage={t("admin_points_expire_logs_empty")}
        >
          <AdminPointExpireLogList logs={logs.rows} />
        </MemberOpsListBody>
      </AdminCard>
    </div>
  );
}
