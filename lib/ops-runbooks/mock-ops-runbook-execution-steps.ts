/**
 * 40단계: 런북 실행 단계 mock
 */

import type {
  OpsRunbookExecutionStep,
  OpsRunbookStepStatus,
} from "@/lib/types/ops-runbook";

const STEPS: OpsRunbookExecutionStep[] = [
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

export function getOpsRunbookExecutionSteps(executionId: string): OpsRunbookExecutionStep[] {
  return STEPS.filter((s) => s.executionId === executionId).sort(
    (a, b) => a.stepOrder - b.stepOrder
  );
}

export function getOpsRunbookExecutionStepById(id: string): OpsRunbookExecutionStep | undefined {
  return STEPS.find((s) => s.id === id);
}

export function addOpsRunbookExecutionStep(
  input: Omit<OpsRunbookExecutionStep, "id">
): OpsRunbookExecutionStep {
  const step: OpsRunbookExecutionStep = {
    ...input,
    id: `ores-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  STEPS.push(step);
  return step;
}

export function updateOpsRunbookExecutionStep(
  id: string,
  update: Partial<Pick<OpsRunbookExecutionStep, "status" | "assignedAdminId" | "assignedAdminNickname" | "startedAt" | "completedAt" | "note">>
): OpsRunbookExecutionStep | null {
  const step = STEPS.find((s) => s.id === id);
  if (!step) return null;
  Object.assign(step, update);
  return { ...step };
}
