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
          options={(["quarterly", "yearly"] as const).map((s) => ({ value: s, label: SCOPE_LABELS[s] }))}
        />
      </AdminFilterBar>

      {highGap.length === 0 ? (
        <AdminEmptyState ko={ko} message={"목표 대비 갭이 큰 영역이 없습니다."} />
      ) : (
        <>
          <div>
            <h3 className="mb-2 sam-text-body-secondary font-medium text-sam-fg">
              갭 분석 (목표 미달 영역 강조)
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {highGap.map(({ domain, gapScore }) => (
                <div
                  key={domain}
                  className="rounded-ui-rect border border-sam-warning bg-sam-warning-soft p-4"
                >
                  <p className="sam-text-helper text-sam-muted">
                    {DOMAIN_LABELS[domain]}
                  </p>
                  <p className="mt-1 sam-text-page-title font-semibold text-sam-warning">
                    갭 +{gapScore}
                  </p>
                  <p className="mt-1 sam-text-helper text-sam-muted">
                    개선 우선순위 추천
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 sam-text-body-secondary font-medium text-sam-fg">
              개선 우선순위 추천
            </h3>
            <p className="sam-text-body-secondary text-sam-muted">
              위 갭이 큰 영역 순으로 분기 계획·로드맵에 반영을 권장합니다.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
