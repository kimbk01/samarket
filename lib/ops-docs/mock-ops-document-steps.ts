/**
 * 39단계: 문서 단계(step) mock
 */

import type { OpsDocumentStep, OpsDocumentStepLinkedType } from "@/lib/types/ops-docs";

const STEPS: OpsDocumentStep[] = [
  {
    id: "ods-1",
    documentId: "od-1",
    stepOrder: 1,
    title: "모니터링 대시보드 확인",
    description: "추천 모니터링에서 Fallback 발생 여부 및 원인 확인",
    isRequired: true,
    estimatedMinutes: 5,
    linkedType: null,
    linkedId: null,
  },
  {
    id: "ods-2",
    documentId: "od-1",
    stepOrder: 2,
    title: "관련 이슈/인시던트 확인",
    description: "해당 surface의 이슈 목록에서 관련 incident 링크 확인",
    isRequired: true,
    estimatedMinutes: 5,
    linkedType: "incident",
    linkedId: "inc-1",
  },
  {
    id: "ods-3",
    documentId: "od-1",
    stepOrder: 3,
    title: "필요 시 롤백 또는 버전 전환",
    description: "배포 관리에서 이전 안정 버전으로 롤백 검토",
    isRequired: false,
    estimatedMinutes: 10,
    linkedType: "deployment",
    linkedId: "rd-1",
  },
  {
    id: "ods-4",
    documentId: "od-2",
    stepOrder: 1,
    title: "헬스체크 확인",
    description: "추천 모니터링 헬스 상태 확인",
    isRequired: true,
    estimatedMinutes: 2,
    linkedType: null,
    linkedId: null,
  },
  {
    id: "ods-5",
    documentId: "od-2",
    stepOrder: 2,
    title: "일간 보고서 KPI 검토",
    description: "추천 보고서에서 당일 KPI 확인",
    isRequired: true,
    estimatedMinutes: 10,
    linkedType: "report",
    linkedId: "rr-1",
  },
  {
    id: "ods-6",
    documentId: "od-3",
    stepOrder: 1,
    title: "문제 버전 확인",
    description: "배포 관리에서 현재 live 버전 및 이슈 확인",
    isRequired: true,
    estimatedMinutes: 5,
    linkedType: "deployment",
    linkedId: null,
  },
  {
    id: "ods-7",
    documentId: "od-3",
    stepOrder: 2,
    title: "롤백 실행",
    description: "이전 안정 버전 선택 후 롤백 실행",
    isRequired: true,
    estimatedMinutes: 5,
    linkedType: "deployment",
    linkedId: null,
  },
];

export function getOpsDocumentSteps(documentId: string): OpsDocumentStep[] {
  return STEPS.filter((s) => s.documentId === documentId).sort(
    (a, b) => a.stepOrder - b.stepOrder
  );
}

export function getOpsDocumentStepById(id: string): OpsDocumentStep | undefined {
  return STEPS.find((s) => s.id === id);
}

export function addOpsDocumentStep(
  input: Omit<OpsDocumentStep, "id">
): OpsDocumentStep {
  const step: OpsDocumentStep = {
    ...input,
    id: `ods-${Date.now()}`,
  };
  STEPS.push(step);
  return step;
}

export function updateOpsDocumentStep(
  id: string,
  update: Partial<Pick<OpsDocumentStep, "stepOrder" | "title" | "description" | "isRequired" | "estimatedMinutes" | "linkedType" | "linkedId">>
): OpsDocumentStep | null {
  const step = STEPS.find((s) => s.id === id);
  if (!step) return null;
  Object.assign(step, update);
  return { ...step };
}

export function deleteOpsDocumentStep(id: string): boolean {
  const idx = STEPS.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  STEPS.splice(idx, 1);
  return true;
}
