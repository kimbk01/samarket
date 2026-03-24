/**
 * 49단계: 오픈 직후 첫 주 KPI mock (35 monitoring, 34 fallback/kill_switch 연계)
 */

import type { LaunchWeekKpis } from "@/lib/types/launch-week";

const base = new Date();
const KPIS: LaunchWeekKpis[] = [
  {
    id: "lwk-1",
    observedDate: new Date(base.getTime() - 6 * 86400000).toISOString().slice(0, 10),
    signUpCount: 42,
    productCreatedCount: 128,
    chatStartedCount: 35,
    transactionCompletedCount: 12,
    reportCreatedCount: 2,
    incidentCount: 1,
    fallbackCount: 0,
    killSwitchCount: 0,
    pointChargeRequestCount: 5,
    adApplicationCount: 1,
    createdAt: new Date().toISOString(),
  },
  {
    id: "lwk-2",
    observedDate: new Date(base.getTime() - 5 * 86400000).toISOString().slice(0, 10),
    signUpCount: 58,
    productCreatedCount: 165,
    chatStartedCount: 48,
    transactionCompletedCount: 18,
    reportCreatedCount: 3,
    incidentCount: 0,
    fallbackCount: 1,
    killSwitchCount: 0,
    pointChargeRequestCount: 8,
    adApplicationCount: 2,
    createdAt: new Date().toISOString(),
  },
  {
    id: "lwk-3",
    observedDate: new Date(base.getTime() - 4 * 86400000).toISOString().slice(0, 10),
    signUpCount: 71,
    productCreatedCount: 192,
    chatStartedCount: 62,
    transactionCompletedCount: 22,
    reportCreatedCount: 5,
    incidentCount: 2,
    fallbackCount: 2,
    killSwitchCount: 0,
    pointChargeRequestCount: 12,
    adApplicationCount: 3,
    createdAt: new Date().toISOString(),
  },
  {
    id: "lwk-4",
    observedDate: new Date(base.getTime() - 3 * 86400000).toISOString().slice(0, 10),
    signUpCount: 65,
    productCreatedCount: 178,
    chatStartedCount: 55,
    transactionCompletedCount: 25,
    reportCreatedCount: 4,
    incidentCount: 0,
    fallbackCount: 0,
    killSwitchCount: 1,
    pointChargeRequestCount: 10,
    adApplicationCount: 2,
    createdAt: new Date().toISOString(),
  },
  {
    id: "lwk-5",
    observedDate: new Date(base.getTime() - 2 * 86400000).toISOString().slice(0, 10),
    signUpCount: 82,
    productCreatedCount: 210,
    chatStartedCount: 70,
    transactionCompletedCount: 30,
    reportCreatedCount: 6,
    incidentCount: 1,
    fallbackCount: 0,
    killSwitchCount: 0,
    pointChargeRequestCount: 15,
    adApplicationCount: 4,
    createdAt: new Date().toISOString(),
  },
  {
    id: "lwk-6",
    observedDate: new Date(base.getTime() - 86400000).toISOString().slice(0, 10),
    signUpCount: 90,
    productCreatedCount: 225,
    chatStartedCount: 78,
    transactionCompletedCount: 35,
    reportCreatedCount: 7,
    incidentCount: 0,
    fallbackCount: 0,
    killSwitchCount: 0,
    pointChargeRequestCount: 18,
    adApplicationCount: 5,
    createdAt: new Date().toISOString(),
  },
  {
    id: "lwk-7",
    observedDate: base.toISOString().slice(0, 10),
    signUpCount: 45,
    productCreatedCount: 95,
    chatStartedCount: 32,
    transactionCompletedCount: 8,
    reportCreatedCount: 2,
    incidentCount: 0,
    fallbackCount: 0,
    killSwitchCount: 0,
    pointChargeRequestCount: 6,
    adApplicationCount: 1,
    createdAt: new Date().toISOString(),
  },
];

export function getLaunchWeekKpis(filters?: {
  observedDate?: string;
  fromDate?: string;
  toDate?: string;
}): LaunchWeekKpis[] {
  let list = [...KPIS].sort(
    (a, b) => new Date(b.observedDate).getTime() - new Date(a.observedDate).getTime()
  );
  if (filters?.observedDate)
    list = list.filter((k) => k.observedDate === filters.observedDate);
  if (filters?.fromDate)
    list = list.filter((k) => k.observedDate >= filters!.fromDate!);
  if (filters?.toDate)
    list = list.filter((k) => k.observedDate <= filters!.toDate!);
  return list;
}

export function getLaunchWeekKpiByDate(
  observedDate: string
): LaunchWeekKpis | undefined {
  return KPIS.find((k) => k.observedDate === observedDate);
}
