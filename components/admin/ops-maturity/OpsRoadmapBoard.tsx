"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  OPS_TOOLS_CHECKLIST_STATUS_KEYS,
  opsToolsLabel,
} from "@/components/admin/i18n/admin-ops-tools-label-keys";
import { useMemo, useState } from "react";
import type { OpsRoadmapStatus, OpsRoadmapDomain } from "@/lib/types/ops-maturity";
import { getOpsImprovementRoadmapItems } from "@/lib/ops-maturity/mock-ops-improvement-roadmap-items";
import { OpsRoadmapCard } from "./OpsRoadmapCard";

const STATUS_COLUMNS: OpsRoadmapStatus[] = [
  "planned",
  "approved",
  "in_progress",
  "blocked",
  "completed",
  "deferred",
];

export function OpsRoadmapBoard() {
  const { t } = useI18n();
  const [domainFilter, setDomainFilter] = useState<OpsRoadmapDomain | "">("");

  const items = useMemo(
    () => getOpsImprovementRoadmapItems({ domain: domainFilter || undefined }),
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
      <div className="flex flex-wrap gap-2">
        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value as OpsRoadmapDomain | "")}
          className="rounded border border-sam-border px-3 py-2 sam-text-body"
        >
          <option value="">{t("admin_ops_tools_maturity_filter_area")}</option>
          <option value="monitoring">{t("admin_ops_tools_cat_monitoring")}</option>
          <option value="automation">{t("admin_ops_tools_cat_automation")}</option>
          <option value="documentation">{t("admin_ops_tools_area_documentation")}</option>
          <option value="response">{t("admin_ops_tools_area_response")}</option>
          <option value="recommendation_quality">{t("admin_ops_tools_area_recommendation")}</option>
          <option value="learning">{t("admin_ops_tools_area_learning")}</option>
        </select>
      </div>
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
