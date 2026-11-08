"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getHighGapDomains } from "@/lib/ops-benchmarks/ops-benchmarks-utils";
import type { OpsBenchmarkScope, OpsBenchmarkDomain } from "@/lib/types/ops-benchmarks";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const SCOPE_LABELS: Record<OpsBenchmarkScope, MessageKey> = {
  quarterly: "admin_ops_bench_scope_quarterly",
  yearly: "admin_ops_bench_scope_yearly",
};

const DOMAIN_LABELS: Record<OpsBenchmarkDomain, MessageKey> = {
  recommendation_quality: "admin_ops_bench_domain_recommendation_quality",
  incident_response: "admin_ops_bench_domain_incident_response",
  automation: "admin_ops_bench_domain_automation",
  documentation: "admin_ops_bench_domain_documentation",
  execution: "admin_ops_bench_domain_execution",
  learning: "admin_ops_bench_domain_learning",
};

const SCOPE_EXTRAS = ["scope"] as const;

export function OpsGapAnalysisCards() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 기간 범위는 주소(`?scope=`)에 보존 (R7). 기본 분기. */
  const lq = useAdminListQuery({ extras: SCOPE_EXTRAS, extraDefaults: { scope: "quarterly" } });
  const scope: OpsBenchmarkScope = lq.query.extras.scope === "yearly" ? "yearly" : "quarterly";
  const highGap = useMemo(() => getHighGapDomains(scope, 6), [scope]);
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
        <AdminFilterSelect
          ko={ko}
          label={t("admin_ops_benchmark_kf6b7b470")}
          name="scope"
          includeAll={false}
          value={scope}
          onChange={(v) => lq.setExtra("scope", v)}
          options={(["quarterly", "yearly"] as const).map((s) => ({ value: s, label: t(SCOPE_LABELS[s]) }))}
        />
      </AdminFilterBar>

      {highGap.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_ops_bench_no_gaps")} />
      ) : (
        <>
          <div>
            <h3 className="mb-2 sam-text-body-secondary font-medium text-sam-fg">
              {t("admin_ops_benchmarks_gap_heading")}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {highGap.map(({ domain, gapScore }) => (
                <div
                  key={domain}
                  className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft p-4"
                >
                  <p className="sam-text-helper text-sam-muted">
                    {t(DOMAIN_LABELS[domain])}
                  </p>
                  <p className="mt-1 sam-text-page-title font-semibold text-sam-warning">
                    {t("admin_ops_benchmarks_gap_score", { score: gapScore })}
                  </p>
                  <p className="mt-1 sam-text-helper text-sam-muted">
                    {t("admin_ops_benchmarks_priority_reco")}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 sam-text-body-secondary font-medium text-sam-fg">
              {t("admin_ops_benchmarks_priority_reco")}
            </h3>
            <p className="sam-text-body-secondary text-sam-muted">
              {t("admin_ops_benchmarks_priority_reco_desc")}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
