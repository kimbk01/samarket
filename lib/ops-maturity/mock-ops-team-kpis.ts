/**
 * 44단계: 팀 운영 KPI mock
 */

import type { OpsTeamKpis, OpsKpiPeriodType } from "@/lib/types/ops-maturity";

function weekKey(d: Date): string {
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return start.toISOString().slice(0, 10);
}

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

const now = new Date();
const thisWeek = weekKey(now);
const lastWeek = weekKey(new Date(now.getTime() - 7 * 86400000));
const thisMonth = monthKey(now);
const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

const KPIS: OpsTeamKpis[] = [
  {
    id: "otk-1",
    periodKey: thisWeek,
    periodType: "weekly",
    incidentAvgResolutionMinutes: 95,
    fallbackRate: 0.02,
    rollbackSuccessRate: 0.9,
    documentFreshnessRate: 0.85,
    checklistCompletionRate: 0.88,
    actionCompletionRate: 0.75,
    ctrChangeRate: 0.02,
    conversionRateChange: 0.01,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "otk-2",
    periodKey: lastWeek,
    periodType: "weekly",
    incidentAvgResolutionMinutes: 120,
    fallbackRate: 0.03,
    rollbackSuccessRate: 0.85,
    documentFreshnessRate: 0.82,
    checklistCompletionRate: 0.8,
    actionCompletionRate: 0.7,
    ctrChangeRate: -0.01,
    conversionRateChange: 0,
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
  {
    id: "otk-3",
    periodKey: thisMonth,
    periodType: "monthly",
    incidentAvgResolutionMinutes: 100,
    fallbackRate: 0.025,
    rollbackSuccessRate: 0.88,
    documentFreshnessRate: 0.84,
    checklistCompletionRate: 0.85,
    actionCompletionRate: 0.72,
    ctrChangeRate: 0.015,
    conversionRateChange: 0.008,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "otk-4",
    periodKey: lastMonth,
    periodType: "monthly",
    incidentAvgResolutionMinutes: 110,
    fallbackRate: 0.03,
    rollbackSuccessRate: 0.85,
    documentFreshnessRate: 0.8,
    checklistCompletionRate: 0.78,
    actionCompletionRate: 0.68,
    ctrChangeRate: 0,
    conversionRateChange: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export function getOpsTeamKpis(filters?: {
  periodType?: OpsKpiPeriodType;
  limit?: number;
}): OpsTeamKpis[] {
  let list = [...KPIS].sort(
    (a, b) => new Date(b.periodKey).getTime() - new Date(a.periodKey).getTime()
  );
  if (filters?.periodType) list = list.filter((k) => k.periodType === filters.periodType);
  const limit = filters?.limit ?? 10;
  return list.slice(0, limit);
}

export function getOpsTeamKpiByPeriod(
  periodKey: string,
  periodType: OpsKpiPeriodType
): OpsTeamKpis | undefined {
  return KPIS.find((k) => k.periodKey === periodKey && k.periodType === periodType);
}
