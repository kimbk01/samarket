"use client";


import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { useMemo } from "react";
import { getLatestOpsBenchmarks } from "@/lib/ops-benchmarks/ops-benchmarks-state";
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

const TREND_LABELS: Record<string, MessageKey> = {
  improving: "admin_ops_bench_trend_improving",
  stable: "admin_ops_bench_trend_stable",
  declining: "admin_ops_bench_trend_declining",
};

const SCOPE_EXTRAS = ["scope"] as const;

export function OpsBenchmarkCards() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 기간 범위는 주소(`?scope=`)에 보존 (R7). 기본 분기. */
  const lq = useAdminListQuery({ extras: SCOPE_EXTRAS, extraDefaults: { scope: "quarterly" } });
  const scope: OpsBenchmarkScope = lq.query.extras.scope === "yearly" ? "yearly" : "quarterly";
  const benchmarks = useMemo(
    () => getLatestOpsBenchmarks(scope),
    [scope]
  );

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
      {benchmarks.length === 0 ? (
        <AdminEmptyState ko={ko} message={t("admin_ops_bench_no_benchmarks")} />
      ) : (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {benchmarks.map((b) => (
          <div
            key={b.id}
            className={`rounded-ui-rect border p-4 ${
              b.gapScore > 5
                ? "border-sam-warning bg-sam-warning-soft"
                : b.gapScore <= 0
                  ? "border-sam-success bg-sam-success-soft"
                  : "border-sam-border bg-sam-surface"
            }`}
          >
            <p className="sam-text-helper text-sam-muted">
              {t(DOMAIN_LABELS[b.domain])}
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-2 sam-text-body">
              <span className="font-medium text-sam-fg">
                현재 {b.currentScore}
              </span>
              <span className="text-sam-meta">/</span>
              <span className="text-sam-muted">{t("admin_target_score")} {b.targetScore}</span>
              <span className="text-sam-meta">/</span>
              <span className="text-sam-muted">{t("admin_reference_score")} {b.referenceScore}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`sam-text-helper ${
                  b.gapScore > 5
                    ? "text-sam-warning"
                    : b.gapScore <= 0
                      ? "text-sam-success"
                      : "text-sam-muted"
                }`}
              >
                갭 {b.gapScore > 0 ? `+${b.gapScore}` : b.gapScore}
              </span>
              <span className="rounded bg-sam-surface-muted px-1.5 py-0.5 sam-text-xxs text-sam-muted">
                {t(TREND_LABELS[b.trend])}
              </span>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
