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

const STATUS_LABELS: Record<OpsQuarterlyPlanStatus, string> = {
  planned: "예정",
  approved: "승인",
  in_progress: "진행중",
  at_risk: "위험",
  completed: "완료",
  dropped: "중단",
};

const DOMAIN_OPTIONS: { value: OpsBenchmarkDomain | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "recommendation_quality", label: "추천 품질" },
  { value: "incident_response", label: "장애 대응" },
  { value: "automation", label: "자동화" },
  { value: "documentation", label: "문서화" },
  { value: "execution", label: "운영 실행력" },
  { value: "learning", label: "학습/회고" },
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
              {opt.label}
            </option>
          ))}
        </AdminFilterSelect>
      </AdminFilterBar>
      <p className="sam-text-body-secondary text-sam-muted">{year}년</p>

      {plans.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={lq.isFiltered ? undefined : "분기별 개선 계획이 없습니다."}
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
                  {STATUS_LABELS[status]} ({byStatus[status].length})
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
