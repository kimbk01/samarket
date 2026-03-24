/**
 * 55단계: DR 시나리오 단계 mock
 */

import type { DrScenarioStep } from "@/lib/types/dr";

const STEPS: DrScenarioStep[] = [
  { id: "drsst-1", scenarioId: "drs-1", stepOrder: 1, stepTitle: "장애 감지", stepDescription: "헬스체크·알림 확인" },
  { id: "drsst-2", scenarioId: "drs-1", stepOrder: 2, stepTitle: "연결 풀 점검", stepDescription: "DB 연결 풀·네트워크 확인" },
  { id: "drsst-3", scenarioId: "drs-1", stepOrder: 3, stepTitle: "페일오버/복구", stepDescription: "백업 DB 또는 재시작" },
  { id: "drsst-4", scenarioId: "drs-2", stepOrder: 1, stepTitle: "5xx 감지", stepDescription: "모니터링·알림 확인" },
  { id: "drsst-5", scenarioId: "drs-2", stepOrder: 2, stepTitle: "트래픽 제한", stepDescription: "레이트 리밋·스케일 아웃" },
  { id: "drsst-6", scenarioId: "drs-3", stepOrder: 1, stepTitle: "인증 실패 감지", stepDescription: "에러 로그·사용자 보고" },
  { id: "drsst-7", scenarioId: "drs-3", stepOrder: 2, stepTitle: "세션/토큰 검증", stepDescription: "JWT·세션 스토어 점검" },
];

export function getDrScenarioSteps(scenarioId: string): DrScenarioStep[] {
  return STEPS.filter((s) => s.scenarioId === scenarioId).sort(
    (a, b) => a.stepOrder - b.stepOrder
  );
}
