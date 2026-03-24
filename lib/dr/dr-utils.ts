/**
 * 55단계: DR 시나리오 라벨 유틸
 */

import type {
  DrScenarioType,
  DrSeverity,
  DrExecutionStatus,
} from "@/lib/types/dr";

const SCENARIO_TYPE_LABELS: Record<DrScenarioType, string> = {
  db_down: "DB 장애",
  api_failure: "API 장애",
  auth_failure: "인증 장애",
  storage_failure: "스토리지 장애",
  chat_failure: "채팅 장애",
  payment_failure: "결제 장애",
};

const SEVERITY_LABELS: Record<DrSeverity, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

const EXECUTION_STATUS_LABELS: Record<DrExecutionStatus, string> = {
  planned: "예정",
  running: "진행중",
  completed: "완료",
  failed: "실패",
};

export function getScenarioTypeLabel(v: DrScenarioType): string {
  return SCENARIO_TYPE_LABELS[v] ?? v;
}

export function getDrSeverityLabel(v: DrSeverity): string {
  return SEVERITY_LABELS[v] ?? v;
}

export function getExecutionStatusLabel(v: DrExecutionStatus): string {
  return EXECUTION_STATUS_LABELS[v] ?? v;
}
