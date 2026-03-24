/**
 * 50단계: 운영 루틴 실행 mock (38 checklist, 37 report, 44 maturity, 45 benchmark 연계)
 */

import type {
  OpsRoutineExecution,
  OpsRoutinePeriodType,
  OpsRoutineExecutionStatus,
} from "@/lib/types/ops-routines";

const now = new Date().toISOString();
const thisMonth = new Date().toISOString().slice(0, 7);
const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 7);
const thisWeek = new Date().toISOString().slice(0, 10);

const EXECUTIONS: OpsRoutineExecution[] = [
  {
    id: "ore-1",
    templateId: "ort-1",
    periodKey: thisWeek,
    periodType: "weekly",
    scheduledDate: thisWeek,
    dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    status: "done",
    priority: "high",
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    completedAt: now,
    carryOverToNextPeriod: false,
    note: "",
    linkedType: "maturity",
    linkedId: null,
    updatedAt: now,
  },
  {
    id: "ore-2",
    templateId: "ort-2",
    periodKey: thisWeek,
    periodType: "weekly",
    scheduledDate: thisWeek,
    dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    status: "in_progress",
    priority: "high",
    ownerAdminId: null,
    ownerAdminNickname: null,
    completedAt: null,
    carryOverToNextPeriod: false,
    note: "",
    linkedType: null,
    linkedId: null,
    updatedAt: now,
  },
  {
    id: "ore-3",
    templateId: "ort-4",
    periodKey: thisMonth,
    periodType: "monthly",
    scheduledDate: thisMonth + "-01",
    dueDate: thisMonth + "-10",
    status: "todo",
    priority: "high",
    ownerAdminId: null,
    ownerAdminNickname: null,
    completedAt: null,
    carryOverToNextPeriod: false,
    note: "",
    linkedType: "report",
    linkedId: "orr-1",
    updatedAt: now,
  },
  {
    id: "ore-4",
    templateId: "ort-6",
    periodKey: thisMonth,
    periodType: "monthly",
    scheduledDate: thisMonth + "-05",
    dueDate: thisMonth + "-15",
    status: "overdue",
    priority: "medium",
    ownerAdminId: null,
    ownerAdminNickname: null,
    completedAt: null,
    carryOverToNextPeriod: true,
    note: "문서 업데이트 지연",
    linkedType: "checklist",
    linkedId: null,
    updatedAt: now,
  },
  {
    id: "ore-5",
    templateId: "ort-7",
    periodKey: thisMonth,
    periodType: "monthly",
    scheduledDate: thisMonth + "-01",
    dueDate: thisMonth + "-08",
    status: "done",
    priority: "high",
    ownerAdminId: "admin1",
    ownerAdminNickname: "관리자",
    completedAt: now,
    carryOverToNextPeriod: false,
    note: "",
    linkedType: "benchmark",
    linkedId: null,
    updatedAt: now,
  },
  {
    id: "ore-6",
    templateId: "ort-4",
    periodKey: lastMonth,
    periodType: "monthly",
    scheduledDate: lastMonth + "-01",
    dueDate: lastMonth + "-10",
    status: "done",
    priority: "high",
    ownerAdminId: null,
    ownerAdminNickname: null,
    completedAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    carryOverToNextPeriod: false,
    note: "",
    linkedType: "report",
    linkedId: null,
    updatedAt: now,
  },
  {
    id: "ore-7",
    templateId: "ort-8",
    periodKey: new Date().getFullYear() + "-Q" + (Math.floor(new Date().getMonth() / 3) + 1),
    periodType: "quarterly",
    scheduledDate: thisMonth + "-01",
    dueDate: null,
    status: "todo",
    priority: "critical",
    ownerAdminId: null,
    ownerAdminNickname: null,
    completedAt: null,
    carryOverToNextPeriod: false,
    note: "월간 운영 회의 아젠다 placeholder. handoff / owner rotation placeholder.",
    linkedType: null,
    linkedId: null,
    updatedAt: now,
  },
];

export function getOpsRoutineExecutions(filters?: {
  periodKey?: string;
  periodType?: OpsRoutinePeriodType;
  status?: OpsRoutineExecutionStatus;
  carryOverToNextPeriod?: boolean;
}): OpsRoutineExecution[] {
  let list = [...EXECUTIONS];
  if (filters?.periodKey)
    list = list.filter((e) => e.periodKey === filters.periodKey);
  if (filters?.periodType)
    list = list.filter((e) => e.periodType === filters.periodType);
  if (filters?.status)
    list = list.filter((e) => e.status === filters.status);
  if (filters?.carryOverToNextPeriod !== undefined)
    list = list.filter((e) => e.carryOverToNextPeriod === filters.carryOverToNextPeriod);
  return list.sort(
    (a, b) =>
      new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime()
  );
}

export function getCarryOverExecutions(): OpsRoutineExecution[] {
  return EXECUTIONS.filter((e) => e.carryOverToNextPeriod);
}

export function getOverdueExecutions(): OpsRoutineExecution[] {
  const today = new Date().toISOString().slice(0, 10);
  return EXECUTIONS.filter(
    (e) =>
      e.dueDate &&
      e.dueDate < today &&
      !["done", "skipped"].includes(e.status)
  );
}
