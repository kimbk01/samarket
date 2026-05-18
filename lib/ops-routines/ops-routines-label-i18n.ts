import { getRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import type {
  OpsOperationalizationStatusType,
  OpsRoutineCadence,
  OpsRoutineCategory,
  OpsRoutineExecutionStatus,
  OpsRoutinePriority,
} from "@/lib/types/ops-routines";

function opsT(key: MessageKey): string {
  return translate(getRuntimeAppLanguage(), key);
}

const CATEGORY_KEYS: Record<OpsRoutineCategory, MessageKey> = {
  monitoring: "ops_cat_monitoring",
  moderation: "ops_cat_moderation",
  content: "ops_cat_content",
  points: "ops_cat_points",
  ads: "ops_cat_ads",
  recommendation: "ops_cat_recommendation",
  docs: "ops_cat_docs",
  automation: "ops_cat_automation",
  reporting: "ops_cat_reporting",
  security: "ops_cat_security",
};

const CADENCE_KEYS: Record<OpsRoutineCadence, MessageKey> = {
  weekly: "ops_cadence_weekly",
  monthly: "ops_cadence_monthly",
  quarterly: "ops_cadence_quarterly",
};

const PRIORITY_KEYS: Record<OpsRoutinePriority, MessageKey> = {
  low: "ops_pri_low",
  medium: "ops_pri_medium",
  high: "ops_pri_high",
  critical: "ops_pri_critical",
};

const EXECUTION_KEYS: Record<OpsRoutineExecutionStatus, MessageKey> = {
  todo: "ops_exec_todo",
  in_progress: "ops_exec_in_progress",
  done: "ops_exec_done",
  skipped: "ops_exec_skipped",
  overdue: "ops_exec_overdue",
};

const OPERATIONALIZATION_KEYS: Record<OpsOperationalizationStatusType, MessageKey> = {
  stabilizing: "ops_op_stabilizing",
  established: "ops_op_established",
  optimized: "ops_op_optimized",
  needs_attention: "ops_op_needs_attention",
};

export function getCategoryLabel(category: OpsRoutineCategory): string {
  return opsT(CATEGORY_KEYS[category]);
}

export function getCadenceLabel(cadence: OpsRoutineCadence): string {
  return opsT(CADENCE_KEYS[cadence]);
}

export function getPriorityLabel(priority: OpsRoutinePriority): string {
  return opsT(PRIORITY_KEYS[priority]);
}

export function getExecutionStatusLabel(status: OpsRoutineExecutionStatus): string {
  return opsT(EXECUTION_KEYS[status]);
}

export function getOperationalizationLabel(status: OpsOperationalizationStatusType): string {
  return opsT(OPERATIONALIZATION_KEYS[status]);
}
