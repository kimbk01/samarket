"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo, useState } from "react";
import { getOpsQuarterlyPlans } from "@/lib/ops-benchmarks/ops-benchmarks-state";
import { OpsQuarterlyPlanCard } from "./OpsQuarterlyPlanCard";
import type {
  OpsQuarterlyPlanStatus,
  OpsBenchmarkDomain,
} from "@/lib/types/ops-benchmarks";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const STATUS_COLUMNS: OpsQuarterlyPlanStatus[] = [
  "planned",
  "approved",
  "in_progress",
  "at_risk",
  "completed",
  "dropped",
];

const STATUS_LABELS: Record<OpsQuarterlyPlanStatus, MessageKey> = {
  planned: "admin_ops_bench_plan_status_planned",
  approved: "admin_ops_bench_plan_status_approved",
  in_progress: "admin_ops_bench_plan_status_in_progress",
  at_risk: "admin_ops_bench_plan_status_at_risk",
  completed: "admin_ops_bench_plan_status_completed",
  dropped: "admin_ops_bench_plan_status_dropped",
};

const DOMAIN_OPTIONS: { value: OpsBenchmarkDomain | ""; label: MessageKey }[] = [
  { value: "", label: "common_all" },
  { value: "recommendation_quality", label: "admin_ops_bench_plan_domain_recommendation_quality" },
  { value: "incident_response", label: "admin_ops_bench_plan_domain_incident_response" },
  { value: "automation", label: "admin_ops_bench_plan_domain_automation" },
  { value: "documentation", label: "admin_ops_bench_plan_domain_documentation" },
  { value: "execution", label: "admin_ops_bench_plan_domain_execution" },
  { value: "learning", label: "admin_ops_bench_plan_domain_learning" },
];

const FILTER_EXTRAS = ["domain"] as const;

export function OpsQuarterlyPlanBoard() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [year] = useState(() => new Date().getFullYear());
  /** 필터는 주소에 보존 — 새로고침·링크 공유·상세 복귀 시 유지 (R7). */
  const lq = useAdminListQuery({ extras: FILTER_EXTRAS });
  const domainFilter = lq.query.extras.domain as OpsBenchmarkDomain | "";

  const plans = useMemo(
    () => getOpsQuarterlyPlans({ year, domain: domainFilter || undefined }),
    [year, domainFilter]
  );

  const byStatus = useMemo(() => {
    const map: Record<OpsQuarterlyPlanStatus, typeof plans> = {
      planned: [],
      approved: [],
      in_progress: [],
      at_risk: [],
      completed: [],
      dropped: [],
    };
    plans.forEach((p) => map[p.status].push(p));
    return map;
  }, [plans]);

  return (
    <div className="space-y-4">
      <AdminFilterBar
        ko={ko}
        draft={lq.draft}
        onDraftChange={lq.setDraft}
        onSubmit={lq.submit}
        onReset={lq.reset}
        showPeriod={false}
        showSearch={false}
      >
        <AdminFilterSelect ko={ko} label={t("admin_prod_migration_k48750694")} name="domain" value={lq.query.extras.domain} onChange={(v) => lq.setExtra("domain", v)}>
          {DOMAIN_OPTIONS.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {t(opt.label)}
            </option>
          ))}
        </AdminFilterSelect>
      </AdminFilterBar>
      <p className="sam-text-body-secondary text-sam-muted">{t("admin_ops_bench_year", { year })}</p>

      {plans.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={lq.isFiltered ? undefined : t("admin_ops_bench_no_quarterly_plans")}
          onReset={lq.isFiltered ? lq.reset : undefined}
        />
      ) : (
        <div className="overflow-x-auto">
          <div className="flex min-w-[900px] gap-4">
            {STATUS_COLUMNS.map((status) => (
              <div
                key={status}
                className="w-[180px] shrink-0 rounded-ui-rect border border-sam-border bg-sam-app/50 p-3"
              >
                <h3 className="mb-2 sam-text-body-secondary font-medium text-sam-fg">
                  {t(STATUS_LABELS[status])} ({byStatus[status].length})
                </h3>
                <div className="space-y-2">
                  {byStatus[status].map((plan) => (
                    <OpsQuarterlyPlanCard key={plan.id} plan={plan} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
