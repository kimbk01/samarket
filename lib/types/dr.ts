/**
 * 55단계: DR / 재해복구 시나리오 타입
 */

export type DrScenarioType =
  | "db_down"
  | "api_failure"
  | "auth_failure"
  | "storage_failure"
  | "chat_failure"
  | "payment_failure";

export type DrSeverity = "low" | "medium" | "high" | "critical";

export interface DrScenario {
  id: string;
  title: string;
  scenarioType: DrScenarioType;
  description: string;
  severity: DrSeverity;
  createdAt: string;
}

export interface DrScenarioStep {
  id: string;
  scenarioId: string;
  stepOrder: number;
  stepTitle: string;
  stepDescription: string;
}

export type DrExecutionStatus =
  | "planned"
  | "running"
  | "completed"
  | "failed";

export interface DrExecution {
  id: string;
  scenarioId: string;
  executionStatus: DrExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  executedByAdminId: string | null;
}
