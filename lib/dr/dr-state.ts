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

const SCENARIOS: DrScenario[] = [];
const STEPS: DrScenarioStep[] = [];
const EXECUTIONS: DrExecution[] = [];

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultDrOpsBundle(): DrOpsBundleV1 {
  return {
    version: 1,
    scenarios: [],
    steps: [],
    executions: [],
  };
}

/** 서버에서 로드한 번들로 메모리 상태 교체 (관리자 클라이언트 hydration) */
export function importDrOpsBundle(bundle: DrOpsBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(SCENARIOS, (bundle.scenarios ?? []).map((s) => ({ ...s })));
  replaceArray(STEPS, (bundle.steps ?? []).map((s) => ({ ...s })));
  replaceArray(EXECUTIONS, (bundle.executions ?? []).map((e) => ({ ...e })));
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
