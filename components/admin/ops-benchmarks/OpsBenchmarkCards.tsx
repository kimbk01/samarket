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

const SCOPE_LABELS: Record<OpsBenchmarkScope, string> = {
  quarterly: "분기",
  yearly: "연간",
};

const DOMAIN_LABELS: Record<OpsBenchmarkDomain, string> = {
  recommendation_quality: "추천 품질",
  incident_response: "장애 대응",
  automation: "자동화 수준",
  documentation: "문서 최신화",
  execution: "운영 실행력",
  learning: "학습/회고 성숙도",
};

const TREND_LABELS: Record<string, string> = {
  improving: "상승",
  stable: "유지",
  declining: "하락",
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
          options={(["quarterly", "yearly"] as const).map((s) => ({ value: s, label: SCOPE_LABELS[s] }))}
        />
      </AdminFilterBar>
      {benchmarks.length === 0 ? (
        <AdminEmptyState ko={ko} message={"해당 기간 벤치마크 데이터가 없습니다."} />
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
              {DOMAIN_LABELS[b.domain]}
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
                {TREND_LABELS[b.trend]}
              </span>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
