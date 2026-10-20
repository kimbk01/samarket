"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_CHECKLIST_STATUS_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo } from "react";
import type { OpsRoadmapStatus, OpsRoadmapDomain } from "@/lib/types/ops-maturity";
import { getOpsImprovementRoadmapItems } from "@/lib/ops-maturity/ops-maturity-state";
import { OpsRoadmapCard } from "./OpsRoadmapCard";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminFilterSelect } from "@/components/admin/sync-list/AdminFilterSelect";

const STATUS_COLUMNS: OpsRoadmapStatus[] = [
  "planned",
  "approved",
  "in_progress",
  "blocked",
  "completed",
  "deferred",
];

const ROADMAP_EXTRAS = ["domain"] as const;

export function OpsRoadmapBoard() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  /** 영역 필터는 주소(`?domain=`)에 보존 (R7). */
  const lq = useAdminListQuery({ extras: ROADMAP_EXTRAS });
  const domainFilter = lq.query.extras.domain as OpsRoadmapDomain | "";

  const items = useMemo(
    () => getOpsImprovementRoadmapItems({ domain: domainFilter || undefined, limit: Number.MAX_SAFE_INTEGER }),
    [domainFilter]
  );

  const byStatus = useMemo(() => {
    const map: Record<OpsRoadmapStatus, typeof items> = {
      planned: [],
      approved: [],
      in_progress: [],
      blocked: [],
      completed: [],
      deferred: [],
    };
    items.forEach((i) => {
      if (map[i.status]) map[i.status].push(i);
    });
    return map;
  }, [items]);

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
        <AdminFilterSelect ko={ko} label={ko ? "영역" : "Area"} name="domain" value={lq.query.extras.domain} onChange={(v) => lq.setExtra("domain", v)}>
          <option value="">{t("admin_ops_tools_maturity_filter_area")}</option>
          <option value="monitoring">{t("admin_ops_tools_cat_monitoring")}</option>
          <option value="automation">{t("admin_ops_tools_cat_automation")}</option>
          <option value="documentation">{t("admin_ops_tools_area_documentation")}</option>
          <option value="response">{t("admin_ops_tools_area_response")}</option>
          <option value="recommendation_quality">{t("admin_ops_tools_area_recommendation")}</option>
          <option value="learning">{t("admin_ops_tools_area_learning")}</option>
        </AdminFilterSelect>
      </AdminFilterBar>
      <div className="grid gap-3 overflow-x-auto lg:grid-cols-6">
        {STATUS_COLUMNS.map((status) => (
          <div key={status} className="min-w-[200px] rounded-ui-rect border border-sam-border bg-sam-app/50 p-3">
            <h3 className="mb-2 sam-text-body-secondary font-medium text-sam-fg">
              {t(opsToolsLabel(OPS_TOOLS_CHECKLIST_STATUS_KEYS, status))} ({byStatus[status].length})
            </h3>
            <div className="space-y-2">
              {byStatus[status].map((item) => (
                <OpsRoadmapCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
