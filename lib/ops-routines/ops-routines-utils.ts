/**
 * 50단계: 운영 루틴 유틸 (라벨)
 */

import type {
  OpsRoutineCategory,
  OpsRoutineCadence,
  OpsRoutinePriority,
  OpsRoutineExecutionStatus,
  OpsOperationalizationStatusType,
} from "@/lib/types/ops-routines";

const CATEGORY_LABELS: Record<OpsRoutineCategory, string> = {
  monitoring: "모니터링",
  moderation: "신고/제재",
  content: "콘텐츠",
  points: "포인트",
  ads: "광고",
  recommendation: "추천",
  docs: "문서",
  automation: "자동화",
  reporting: "보고",
  security: "보안",
};

const CADENCE_LABELS: Record<OpsRoutineCadence, string> = {
  weekly: "주간",
  monthly: "월간",
  quarterly: "분기",
};

const PRIORITY_LABELS: Record<OpsRoutinePriority, string> = {
  low: "낮음",
  medium: "중간",
  high: "높음",
  critical: "긴급",
};

const EXECUTION_STATUS_LABELS: Record<OpsRoutineExecutionStatus, string> = {
  todo: "할 일",
  in_progress: "진행중",
  done: "완료",
  skipped: "건너뜀",
  overdue: "지연",
};

const OPERATIONALIZATION_LABELS: Record<
  OpsOperationalizationStatusType,
  string
> = {
  stabilizing: "안정화 중",
  established: "정착",
  optimized: "최적화",
  needs_attention: "관심 필요",
};

export function getCategoryLabel(
  category: OpsRoutineCategory
): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function getCadenceLabel(cadence: OpsRoutineCadence): string {
  return CADENCE_LABELS[cadence] ?? cadence;
}

export function getPriorityLabel(priority: OpsRoutinePriority): string {
  return PRIORITY_LABELS[priority] ?? priority;
}

export function getExecutionStatusLabel(
  status: OpsRoutineExecutionStatus
): string {
  return EXECUTION_STATUS_LABELS[status] ?? status;
}

export function getOperationalizationLabel(
  status: OpsOperationalizationStatusType
): string {
  return OPERATIONALIZATION_LABELS[status] ?? status;
}
