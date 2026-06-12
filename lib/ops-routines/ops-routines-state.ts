/**
 * 운영 루틴 — 템플릿·실행·월간 메모 단일 저장소.
 * 영속화: `ops-routines-db` + `/api/admin/ops-routines`
 */
import type {
  OpsRoutineTemplate,
  OpsRoutineCategory,
  OpsRoutineExecution,
  OpsRoutinePeriodType,
  OpsRoutineExecutionStatus,
  OpsMonthlyNote,
} from "@/lib/types/ops-routines";

function isoNow() {
  return new Date().toISOString();
}

function defaultRoutineTemplates(): OpsRoutineTemplate[] {
  const now = isoNow();
  return [
    {
      id: "ort-1",
      title: "추천 모니터링 헬스체크",
      category: "monitoring",
      cadence: "weekly",
      defaultPriority: "high",
      defaultOwnerRole: "ops",
      slaDays: 1,
      isActive: true,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "ort-2",
      title: "신고/제재 처리 현황 점검",
      category: "moderation",
      cadence: "weekly",
      defaultPriority: "high",
      defaultOwnerRole: "moderation",
      slaDays: 1,
      isActive: true,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "ort-3",
      title: "일간 운영 보고서 검토",
      category: "reporting",
      cadence: "weekly",
      defaultPriority: "medium",
      defaultOwnerRole: "ops",
      slaDays: 2,
      isActive: true,
      sortOrder: 3,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "ort-4",
      title: "월간 추천 성과 리포트 검토",
      category: "reporting",
      cadence: "monthly",
      defaultPriority: "high",
      defaultOwnerRole: "ops",
      slaDays: 5,
      isActive: true,
      sortOrder: 4,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "ort-5",
      title: "포인트/충전 정책 점검",
      category: "points",
      cadence: "monthly",
      defaultPriority: "medium",
      defaultOwnerRole: "ops",
      slaDays: null,
      isActive: true,
      sortOrder: 5,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "ort-6",
      title: "운영 문서/SOP 최신화 확인",
      category: "docs",
      cadence: "monthly",
      defaultPriority: "medium",
      defaultOwnerRole: "ops",
      slaDays: 7,
      isActive: true,
      sortOrder: 6,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "ort-7",
      title: "성숙도/벤치마크 점검",
      category: "reporting",
      cadence: "monthly",
      defaultPriority: "high",
      defaultOwnerRole: "ops",
      slaDays: 5,
      isActive: true,
      sortOrder: 7,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "ort-8",
      title: "분기 운영 회의 아젠다 placeholder",
      category: "reporting",
      cadence: "quarterly",
      defaultPriority: "critical",
      defaultOwnerRole: "ops",
      slaDays: null,
      isActive: true,
      sortOrder: 8,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "ort-9",
      title: "자동화 규칙·알림 점검",
      category: "automation",
      cadence: "monthly",
      defaultPriority: "medium",
      defaultOwnerRole: "ops",
      slaDays: null,
      isActive: true,
      sortOrder: 9,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "ort-10",
      title: "보안/권한 점검 placeholder",
      category: "security",
      cadence: "quarterly",
      defaultPriority: "high",
      defaultOwnerRole: "ops",
      slaDays: null,
      isActive: true,
      sortOrder: 10,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function defaultRoutineExecutions(): OpsRoutineExecution[] {
  const now = isoNow();
  const thisMonth = now.slice(0, 7);
  const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 7);
  const thisWeek = now.slice(0, 10);

  return [
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
      periodKey:
        new Date().getFullYear() + "-Q" + (Math.floor(new Date().getMonth() / 3) + 1),
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
}

function defaultMonthlyNotes(): OpsMonthlyNote[] {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 7);

  return [
    {
      id: "omn-1",
      monthKey: lastMonth,
      summary: "첫 달 운영 정착. 추천·모니터링 안정화. 문서 업데이트 일부 지연.",
      topRisks: "문서 최신화 지연, carry-over 1건",
      topWins: "주간 루틴 이행률 90%",
      followUpFocus: "다음 달 carry-over task 정리, SOP 갱신",
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      createdByAdminId: "admin1",
      createdByAdminNickname: "관리자",
    },
    {
      id: "omn-2",
      monthKey: thisMonth,
      summary: "월간 운영 루틴 진행 중. 성숙도/벤치마크 점검 완료.",
      topRisks: "SOP 문서 overdue",
      topWins: "월간 리포트 검토 완료",
      followUpFocus: "문서 갱신, 다음 달 carry-over 최소화",
      createdAt: new Date().toISOString(),
      createdByAdminId: "admin1",
      createdByAdminNickname: "관리자",
    },
  ];
}

const ROUTINE_TEMPLATES: OpsRoutineTemplate[] = defaultRoutineTemplates();
const ROUTINE_EXECUTIONS: OpsRoutineExecution[] = defaultRoutineExecutions();
const MONTHLY_NOTES: OpsMonthlyNote[] = defaultMonthlyNotes();

export type OpsRoutinesBundleV1 = {
  version: 1;
  routineTemplates: OpsRoutineTemplate[];
  routineExecutions: OpsRoutineExecution[];
  monthlyNotes: OpsMonthlyNote[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultOpsRoutinesBundle(): OpsRoutinesBundleV1 {
  return {
    version: 1,
    routineTemplates: defaultRoutineTemplates().map((t) => ({ ...t })),
    routineExecutions: defaultRoutineExecutions().map((e) => ({ ...e })),
    monthlyNotes: defaultMonthlyNotes().map((n) => ({ ...n })),
  };
}

export function importOpsRoutinesBundle(bundle: OpsRoutinesBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(
    ROUTINE_TEMPLATES,
    (bundle.routineTemplates ?? []).map((t) => ({ ...t }))
  );
  replaceArray(
    ROUTINE_EXECUTIONS,
    (bundle.routineExecutions ?? []).map((e) => ({ ...e }))
  );
  replaceArray(MONTHLY_NOTES, (bundle.monthlyNotes ?? []).map((n) => ({ ...n })));
  if (!ROUTINE_TEMPLATES.length)
    replaceArray(ROUTINE_TEMPLATES, defaultRoutineTemplates());
  if (!ROUTINE_EXECUTIONS.length)
    replaceArray(ROUTINE_EXECUTIONS, defaultRoutineExecutions());
}

export function exportOpsRoutinesBundle(): OpsRoutinesBundleV1 {
  return {
    version: 1,
    routineTemplates: ROUTINE_TEMPLATES.map((t) => ({ ...t })),
    routineExecutions: ROUTINE_EXECUTIONS.map((e) => ({ ...e })),
    monthlyNotes: MONTHLY_NOTES.map((n) => ({ ...n })),
  };
}

/* ─── routine templates ─────────────────────────────────────── */

export function getOpsRoutineTemplates(filters?: {
  category?: OpsRoutineCategory;
  cadence?: "weekly" | "monthly" | "quarterly";
  isActive?: boolean;
}): OpsRoutineTemplate[] {
  let list = [...ROUTINE_TEMPLATES].sort((a, b) => a.sortOrder - b.sortOrder);
  if (filters?.category)
    list = list.filter((t) => t.category === filters.category);
  if (filters?.cadence)
    list = list.filter((t) => t.cadence === filters.cadence);
  if (filters?.isActive !== undefined)
    list = list.filter((t) => t.isActive === filters.isActive);
  return list;
}

export function getOpsRoutineTemplateById(
  id: string
): OpsRoutineTemplate | undefined {
  return ROUTINE_TEMPLATES.find((t) => t.id === id);
}

/* ─── routine executions ────────────────────────────────────── */

export function getOpsRoutineExecutions(filters?: {
  periodKey?: string;
  periodType?: OpsRoutinePeriodType;
  status?: OpsRoutineExecutionStatus;
  carryOverToNextPeriod?: boolean;
}): OpsRoutineExecution[] {
  let list = [...ROUTINE_EXECUTIONS];
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
  return ROUTINE_EXECUTIONS.filter((e) => e.carryOverToNextPeriod);
}

export function getOverdueExecutions(): OpsRoutineExecution[] {
  const today = new Date().toISOString().slice(0, 10);
  return ROUTINE_EXECUTIONS.filter(
    (e) =>
      e.dueDate &&
      e.dueDate < today &&
      !["done", "skipped"].includes(e.status)
  );
}

/* ─── monthly notes ─────────────────────────────────────────── */

export function getOpsMonthlyNotes(filters?: {
  monthKey?: string;
}): OpsMonthlyNote[] {
  let list = [...MONTHLY_NOTES].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.monthKey)
    list = list.filter((n) => n.monthKey === filters.monthKey);
  return list;
}

export function getOpsMonthlyNoteByMonth(
  monthKey: string
): OpsMonthlyNote | undefined {
  return MONTHLY_NOTES.filter((n) => n.monthKey === monthKey).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
}
