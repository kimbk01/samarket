/**
 * DR 운영 — 단일 가변 상태 (관리자 UI + 유틸).
 * 영속화는 `dr-db` + `/api/admin/dr` 가 담당.
 */
import type {
  DrExecution,
  DrExecutionStatus,
  DrScenario,
  DrScenarioStep,
  DrScenarioType,
  DrSeverity,
} from "@/lib/types/dr";

export type DrOpsBundleV1 = {
  version: 1;
  scenarios: DrScenario[];
  steps: DrScenarioStep[];
  executions: DrExecution[];
};

function defaultScenarios(): DrScenario[] {
  return [
    {
      id: "drs-1",
      title: "DB 연결 끊김",
      scenarioType: "db_down" as DrScenarioType,
      description: "Supabase/DB 연결 불가 시 대응",
      severity: "critical" as DrSeverity,
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
    },
    {
      id: "drs-2",
      title: "API 대량 5xx",
      scenarioType: "api_failure" as DrScenarioType,
      description: "API 서버 과부하·일시 장애",
      severity: "high" as DrSeverity,
      createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    },
    {
      id: "drs-3",
      title: "인증 서비스 장애",
      scenarioType: "auth_failure" as DrScenarioType,
      description: "로그인/토큰 검증 불가",
      severity: "critical" as DrSeverity,
      createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    },
  ];
}

function defaultSteps(): DrScenarioStep[] {
  return [
    { id: "drsst-1", scenarioId: "drs-1", stepOrder: 1, stepTitle: "장애 감지", stepDescription: "헬스체크·알림 확인" },
    { id: "drsst-2", scenarioId: "drs-1", stepOrder: 2, stepTitle: "연결 풀 점검", stepDescription: "DB 연결 풀·네트워크 확인" },
    { id: "drsst-3", scenarioId: "drs-1", stepOrder: 3, stepTitle: "페일오버/복구", stepDescription: "백업 DB 또는 재시작" },
    { id: "drsst-4", scenarioId: "drs-2", stepOrder: 1, stepTitle: "5xx 감지", stepDescription: "모니터링·알림 확인" },
    { id: "drsst-5", scenarioId: "drs-2", stepOrder: 2, stepTitle: "트래픽 제한", stepDescription: "레이트 리밋·스케일 아웃" },
    { id: "drsst-6", scenarioId: "drs-3", stepOrder: 1, stepTitle: "인증 실패 감지", stepDescription: "에러 로그·사용자 보고" },
    { id: "drsst-7", scenarioId: "drs-3", stepOrder: 2, stepTitle: "세션/토큰 검증", stepDescription: "JWT·세션 스토어 점검" },
  ];
}

function defaultExecutions(): DrExecution[] {
  const now = new Date().toISOString();
  return [
    {
      id: "dre-1",
      scenarioId: "drs-1",
      executionStatus: "completed" as DrExecutionStatus,
      startedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
      completedAt: new Date(Date.now() - 14 * 86400000 + 1800000).toISOString(),
      executedByAdminId: "admin1",
    },
    {
      id: "dre-2",
      scenarioId: "drs-2",
      executionStatus: "planned" as DrExecutionStatus,
      startedAt: now,
      completedAt: null,
      executedByAdminId: null,
    },
  ];
}

const SCENARIOS: DrScenario[] = defaultScenarios();
const STEPS: DrScenarioStep[] = defaultSteps();
const EXECUTIONS: DrExecution[] = defaultExecutions();

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultDrOpsBundle(): DrOpsBundleV1 {
  return {
    version: 1,
    scenarios: defaultScenarios().map((s) => ({ ...s })),
    steps: defaultSteps().map((s) => ({ ...s })),
    executions: defaultExecutions().map((e) => ({ ...e })),
  };
}

/** 서버에서 로드한 번들로 메모리 상태 교체 (관리자 클라이언트 hydration) */
export function importDrOpsBundle(bundle: DrOpsBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(SCENARIOS, (bundle.scenarios ?? []).map((s) => ({ ...s })));
  replaceArray(STEPS, (bundle.steps ?? []).map((s) => ({ ...s })));
  replaceArray(EXECUTIONS, (bundle.executions ?? []).map((e) => ({ ...e })));
  if (!SCENARIOS.length) replaceArray(SCENARIOS, defaultScenarios());
  if (!STEPS.length) replaceArray(STEPS, defaultSteps());
  if (!EXECUTIONS.length) replaceArray(EXECUTIONS, defaultExecutions());
}

export function exportDrOpsBundle(): DrOpsBundleV1 {
  return {
    version: 1,
    scenarios: SCENARIOS.map((s) => ({ ...s })),
    steps: STEPS.map((s) => ({ ...s })),
    executions: EXECUTIONS.map((e) => ({ ...e })),
  };
}

export function getDrScenarios(filters?: {
  scenarioType?: DrScenarioType;
  severity?: DrSeverity;
}): DrScenario[] {
  let list = [...SCENARIOS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.scenarioType)
    list = list.filter((s) => s.scenarioType === filters.scenarioType);
  if (filters?.severity)
    list = list.filter((s) => s.severity === filters.severity);
  return list;
}

export function getDrScenarioById(id: string): DrScenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function getDrScenarioSteps(scenarioId: string): DrScenarioStep[] {
  return STEPS.filter((s) => s.scenarioId === scenarioId).sort(
    (a, b) => a.stepOrder - b.stepOrder
  );
}

export function getDrExecutions(filters?: {
  scenarioId?: string;
  executionStatus?: DrExecutionStatus;
}): DrExecution[] {
  let list = [...EXECUTIONS].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  if (filters?.scenarioId)
    list = list.filter((e) => e.scenarioId === filters.scenarioId);
  if (filters?.executionStatus)
    list = list.filter((e) => e.executionStatus === filters.executionStatus);
  return list;
}
