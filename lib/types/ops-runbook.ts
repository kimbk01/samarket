/**
 * 40단계: 운영 런북 실행 / 대응 워크플로우 / 대응 결과 기록 타입
 */

export type OpsDocType = "sop" | "playbook" | "scenario";

export type OpsRunbookLinkedType =
  | "incident"
  | "deployment"
  | "rollback"
  | "fallback"
  | "kill_switch"
  | "manual";

export type OpsRunbookExecutionStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "aborted";

export type OpsRunbookStepStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "skipped"
  | "blocked";

export type OpsRunbookStepLinkedType =
  | "incident"
  | "deployment"
  | "report"
  | "checklist"
  | "action_item";

export type OpsRunbookOutcomeType =
  | "resolved"
  | "mitigated"
  | "rolled_back"
  | "fallback_applied"
  | "monitoring_only"
  | "escalated";

export type OpsRunbookSeverityAfter = "low" | "medium" | "high" | "critical";

export type OpsRunbookLogActionType =
  | "start_execution"
  | "start_step"
  | "complete_step"
  | "skip_step"
  | "block_step"
  | "add_note"
  | "complete_execution"
  | "abort_execution"
  | "write_result";

export type OpsRunbookLogActorType = "admin" | "system";

export interface OpsRunbookExecution {
  id: string;
  documentId: string;
  documentTitle: string;
  documentType: OpsDocType;
  linkedType: OpsRunbookLinkedType;
  linkedId: string | null;
  executionStatus: OpsRunbookExecutionStatus;
  startedAt: string;
  completedAt: string | null;
  startedByAdminId: string;
  startedByAdminNickname: string;
  summary: string;
  resultNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpsRunbookExecutionStep {
  id: string;
  executionId: string;
  sourceStepId: string;
  stepOrder: number;
  title: string;
  description: string;
  status: OpsRunbookStepStatus;
  assignedAdminId: string | null;
  assignedAdminNickname: string | null;
  startedAt: string | null;
  completedAt: string | null;
  note: string;
  linkedType: OpsRunbookStepLinkedType | null;
  linkedId: string | null;
}

export interface OpsRunbookResult {
  id: string;
  executionId: string;
  outcomeType: OpsRunbookOutcomeType;
  severityAfter: OpsRunbookSeverityAfter;
  summary: string;
  rootCause: string;
  followupNeeded: boolean;
  createdAt: string;
  createdByAdminId: string;
  createdByAdminNickname: string;
}

export interface OpsRunbookExecutionLog {
  id: string;
  executionId: string;
  actionType: OpsRunbookLogActionType;
  actorType: OpsRunbookLogActorType;
  actorId: string;
  actorNickname: string;
  stepId: string | null;
  note: string;
  createdAt: string;
}

export interface OpsRunbookSummary {
  totalExecutions: number;
  inProgressExecutions: number;
  completedExecutions: number;
  blockedExecutions: number;
  avgCompletionMinutes: number | null;
  latestExecutionAt: string | null;
}
