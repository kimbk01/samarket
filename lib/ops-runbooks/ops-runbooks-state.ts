/**
 * 런북 실행 — 실행·단계·로그·결과 단일 저장소.
 * 영속화: `ops-runbooks-db` + admin_settings (`ops_runbooks_v1`)
 */
import type {
  OpsRunbookExecution,
  OpsRunbookExecutionStatus,
  OpsRunbookLinkedType,
  OpsRunbookExecutionStep,
  OpsRunbookExecutionLog,
  OpsRunbookResult,
} from "@/lib/types/ops-runbook";

function defaultExecutions(): OpsRunbookExecution[] {
  return [
    {
      id: "ore-1",
      documentId: "od-1",
      documentTitle: "추천 피드 Fallback 대응 플레이북",
      documentType: "playbook",
      linkedType: "incident",
      linkedId: "inc-1",
      executionStatus: "in_progress",
      startedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      completedAt: null,
      startedByAdminId: "admin1",
      startedByAdminNickname: "관리자",
      summary: "Fallback 발생 대응 진행 중",
      resultNote: "",
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "ore-2",
      documentId: "od-3",
      documentTitle: "추천 버전 롤백 시나리오",
      documentType: "scenario",
      linkedType: "rollback",
      linkedId: "rd-1",
      executionStatus: "completed",
      startedAt: new Date(Date.now() - 24 * 3600000).toISOString(),
      completedAt: new Date(Date.now() - 23 * 3600000).toISOString(),
      startedByAdminId: "admin1",
      startedByAdminNickname: "관리자",
      summary: "롤백 완료, 지표 정상화",
      resultNote: "이전 버전으로 롤백 후 CTR 복구 확인",
      createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 23 * 3600000).toISOString(),
    },
  ];
}

function defaultExecutionSteps(): OpsRunbookExecutionStep[] {
  return [
    {
      id: "ores-1",
      executionId: "ore-1",
      sourceStepId: "ods-1",
      stepOrder: 1,
      title: "모니터링 대시보드 확인",
      description: "추천 모니터링에서 Fallback 발생 여부 및 원인 확인",
      status: "done",
      assignedAdminId: "admin1",
      assignedAdminNickname: "관리자",
      startedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      completedAt: new Date(Date.now() - 1.5 * 3600000).toISOString(),
      note: "Fallback 확인됨",
      linkedType: null,
      linkedId: null,
    },
    {
      id: "ores-2",
      executionId: "ore-1",
      sourceStepId: "ods-2",
      stepOrder: 2,
      title: "관련 이슈/인시던트 확인",
      description: "해당 surface의 이슈 목록에서 관련 incident 링크 확인",
      status: "in_progress",
      assignedAdminId: "admin1",
      assignedAdminNickname: "관리자",
      startedAt: new Date(Date.now() - 1 * 3600000).toISOString(),
      completedAt: null,
      note: "",
      linkedType: "incident",
      linkedId: "inc-1",
    },
    {
      id: "ores-3",
      executionId: "ore-1",
      sourceStepId: "ods-3",
      stepOrder: 3,
      title: "필요 시 롤백 또는 버전 전환",
      description: "배포 관리에서 이전 안정 버전으로 롤백 검토",
      status: "pending",
      assignedAdminId: null,
      assignedAdminNickname: null,
      startedAt: null,
      completedAt: null,
      note: "",
      linkedType: "deployment",
      linkedId: "rd-1",
    },
    {
      id: "ores-4",
      executionId: "ore-2",
      sourceStepId: "ods-6",
      stepOrder: 1,
      title: "문제 버전 확인",
      description: "배포 관리에서 현재 live 버전 및 이슈 확인",
      status: "done",
      assignedAdminId: "admin1",
      assignedAdminNickname: "관리자",
      startedAt: new Date(Date.now() - 24 * 3600000).toISOString(),
      completedAt: new Date(Date.now() - 24 * 3600000 + 5 * 60000).toISOString(),
      note: "",
      linkedType: "deployment",
      linkedId: null,
    },
    {
      id: "ores-5",
      executionId: "ore-2",
      sourceStepId: "ods-7",
      stepOrder: 2,
      title: "롤백 실행",
      description: "이전 안정 버전 선택 후 롤백 실행",
      status: "done",
      assignedAdminId: "admin1",
      assignedAdminNickname: "관리자",
      startedAt: new Date(Date.now() - 24 * 3600000 + 6 * 60000).toISOString(),
      completedAt: new Date(Date.now() - 23 * 3600000).toISOString(),
      note: "롤백 완료",
      linkedType: "deployment",
      linkedId: null,
    },
  ];
}

function defaultExecutionLogs(): OpsRunbookExecutionLog[] {
  return [
    {
      id: "orel-1",
      executionId: "ore-1",
      actionType: "start_execution",
      actorType: "admin",
      actorId: "admin1",
      actorNickname: "관리자",
      stepId: null,
      note: "incident inc-1 연동",
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
    {
      id: "orel-2",
      executionId: "ore-1",
      actionType: "start_step",
      actorType: "admin",
      actorId: "admin1",
      actorNickname: "관리자",
      stepId: "ores-1",
      note: "",
      createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    },
    {
      id: "orel-3",
      executionId: "ore-1",
      actionType: "complete_step",
      actorType: "admin",
      actorId: "admin1",
      actorNickname: "관리자",
      stepId: "ores-1",
      note: "Fallback 확인됨",
      createdAt: new Date(Date.now() - 1.5 * 3600000).toISOString(),
    },
    {
      id: "orel-4",
      executionId: "ore-1",
      actionType: "start_step",
      actorType: "admin",
      actorId: "admin1",
      actorNickname: "관리자",
      stepId: "ores-2",
      note: "",
      createdAt: new Date(Date.now() - 1 * 3600000).toISOString(),
    },
    {
      id: "orel-5",
      executionId: "ore-2",
      actionType: "start_execution",
      actorType: "admin",
      actorId: "admin1",
      actorNickname: "관리자",
      stepId: null,
      note: "",
      createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    },
    {
      id: "orel-6",
      executionId: "ore-2",
      actionType: "complete_execution",
      actorType: "admin",
      actorId: "admin1",
      actorNickname: "관리자",
      stepId: null,
      note: "롤백 완료",
      createdAt: new Date(Date.now() - 23 * 3600000).toISOString(),
    },
    {
      id: "orel-7",
      executionId: "ore-2",
      actionType: "write_result",
      actorType: "admin",
      actorId: "admin1",
      actorNickname: "관리자",
      stepId: null,
      note: "",
      createdAt: new Date(Date.now() - 23 * 3600000).toISOString(),
    },
  ];
}

function defaultResults(): OpsRunbookResult[] {
  return [
    {
      id: "orr-1",
      executionId: "ore-2",
      outcomeType: "rolled_back",
      severityAfter: "low",
      summary: "이전 안정 버전으로 롤백 후 지표 정상화",
      rootCause: "신규 버전에서 특정 트래픽 구간에서 스코어 계산 이슈 추정",
      followupNeeded: true,
      createdAt: new Date(Date.now() - 23 * 3600000).toISOString(),
      createdByAdminId: "admin1",
      createdByAdminNickname: "관리자",
    },
  ];
}

const EXECUTIONS: OpsRunbookExecution[] = defaultExecutions();
const EXECUTION_STEPS: OpsRunbookExecutionStep[] = defaultExecutionSteps();
const EXECUTION_LOGS: OpsRunbookExecutionLog[] = defaultExecutionLogs();
const RESULTS: OpsRunbookResult[] = defaultResults();

export type OpsRunbooksBundleV1 = {
  version: 1;
  executions: OpsRunbookExecution[];
  executionSteps: OpsRunbookExecutionStep[];
  executionLogs: OpsRunbookExecutionLog[];
  results: OpsRunbookResult[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultOpsRunbooksBundle(): OpsRunbooksBundleV1 {
  return {
    version: 1,
    executions: defaultExecutions().map((e) => ({ ...e })),
    executionSteps: defaultExecutionSteps().map((s) => ({ ...s })),
    executionLogs: defaultExecutionLogs().map((l) => ({ ...l })),
    results: defaultResults().map((r) => ({ ...r })),
  };
}

export function importOpsRunbooksBundle(bundle: OpsRunbooksBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(EXECUTIONS, (bundle.executions ?? []).map((e) => ({ ...e })));
  replaceArray(EXECUTION_STEPS, (bundle.executionSteps ?? []).map((s) => ({ ...s })));
  replaceArray(EXECUTION_LOGS, (bundle.executionLogs ?? []).map((l) => ({ ...l })));
  replaceArray(RESULTS, (bundle.results ?? []).map((r) => ({ ...r })));
  if (!EXECUTIONS.length) replaceArray(EXECUTIONS, defaultExecutions());
  if (!EXECUTION_STEPS.length) replaceArray(EXECUTION_STEPS, defaultExecutionSteps());
  if (!EXECUTION_LOGS.length) replaceArray(EXECUTION_LOGS, defaultExecutionLogs());
  if (!RESULTS.length) replaceArray(RESULTS, defaultResults());
}

export function exportOpsRunbooksBundle(): OpsRunbooksBundleV1 {
  return {
    version: 1,
    executions: EXECUTIONS.map((e) => ({ ...e })),
    executionSteps: EXECUTION_STEPS.map((s) => ({ ...s })),
    executionLogs: EXECUTION_LOGS.map((l) => ({ ...l })),
    results: RESULTS.map((r) => ({ ...r })),
  };
}

/* ─── executions ──────────────────────────────────────────────── */

export function getOpsRunbookExecutions(filters?: {
  status?: OpsRunbookExecutionStatus;
  linkedType?: OpsRunbookLinkedType;
  documentId?: string;
  limit?: number;
}): OpsRunbookExecution[] {
  let list = [...EXECUTIONS].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  if (filters?.status) list = list.filter((e) => e.executionStatus === filters.status);
  if (filters?.linkedType) list = list.filter((e) => e.linkedType === filters.linkedType);
  if (filters?.documentId) list = list.filter((e) => e.documentId === filters.documentId);
  const limit = filters?.limit ?? 100;
  return list.slice(0, limit);
}

export function getOpsRunbookExecutionById(id: string): OpsRunbookExecution | undefined {
  return EXECUTIONS.find((e) => e.id === id);
}

export function addOpsRunbookExecution(
  input: Omit<OpsRunbookExecution, "id" | "createdAt" | "updatedAt">
): OpsRunbookExecution {
  const now = new Date().toISOString();
  const exec: OpsRunbookExecution = {
    ...input,
    id: `ore-${Date.now()}`,
    createdAt: input.startedAt,
    updatedAt: now,
  };
  EXECUTIONS.unshift(exec);
  return exec;
}

export function updateOpsRunbookExecution(
  id: string,
  update: Partial<
    Pick<OpsRunbookExecution, "executionStatus" | "completedAt" | "summary" | "resultNote">
  >
): OpsRunbookExecution | null {
  const exec = EXECUTIONS.find((e) => e.id === id);
  if (!exec) return null;
  const now = new Date().toISOString();
  Object.assign(exec, update, { updatedAt: now });
  return { ...exec };
}

/* ─── execution steps ───────────────────────────────────────── */

export function getOpsRunbookExecutionSteps(executionId: string): OpsRunbookExecutionStep[] {
  return EXECUTION_STEPS.filter((s) => s.executionId === executionId).sort(
    (a, b) => a.stepOrder - b.stepOrder
  );
}

export function getOpsRunbookExecutionStepById(id: string): OpsRunbookExecutionStep | undefined {
  return EXECUTION_STEPS.find((s) => s.id === id);
}

export function addOpsRunbookExecutionStep(
  input: Omit<OpsRunbookExecutionStep, "id">
): OpsRunbookExecutionStep {
  const step: OpsRunbookExecutionStep = {
    ...input,
    id: `ores-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  EXECUTION_STEPS.push(step);
  return step;
}

export function updateOpsRunbookExecutionStep(
  id: string,
  update: Partial<
    Pick<
      OpsRunbookExecutionStep,
      | "status"
      | "assignedAdminId"
      | "assignedAdminNickname"
      | "startedAt"
      | "completedAt"
      | "note"
    >
  >
): OpsRunbookExecutionStep | null {
  const step = EXECUTION_STEPS.find((s) => s.id === id);
  if (!step) return null;
  Object.assign(step, update);
  return { ...step };
}

/* ─── execution logs ────────────────────────────────────────── */

export function getOpsRunbookExecutionLogs(
  executionId: string,
  options?: { limit?: number }
): OpsRunbookExecutionLog[] {
  const list = EXECUTION_LOGS.filter((l) => l.executionId === executionId).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const limit = options?.limit ?? 50;
  return list.slice(0, limit);
}

export function addOpsRunbookExecutionLog(
  input: Omit<OpsRunbookExecutionLog, "id">
): OpsRunbookExecutionLog {
  const log: OpsRunbookExecutionLog = {
    ...input,
    id: `orel-${Date.now()}`,
  };
  EXECUTION_LOGS.unshift(log);
  return log;
}

/* ─── results ───────────────────────────────────────────────── */

export function getOpsRunbookResults(executionId: string): OpsRunbookResult[] {
  return RESULTS.filter((r) => r.executionId === executionId).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getOpsRunbookResultById(id: string): OpsRunbookResult | undefined {
  return RESULTS.find((r) => r.id === id);
}

export function addOpsRunbookResult(input: Omit<OpsRunbookResult, "id">): OpsRunbookResult {
  const result: OpsRunbookResult = {
    ...input,
    id: `orr-${Date.now()}`,
  };
  RESULTS.unshift(result);
  return result;
}
