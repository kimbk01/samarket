/**
 * 59단계: 자동화 라벨 유틸
 */

import type {
  AutomationTriggerType,
  AutomationActionType,
} from "@/lib/types/automation";

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  error: "에러",
  latency: "지연",
  usage: "사용량",
};

const ACTION_LABELS: Record<AutomationActionType, string> = {
  alert: "알림",
  rollback: "롤백",
  disable_feature: "기능 비활성화",
};

export function getTriggerTypeLabel(v: AutomationTriggerType): string {
  return TRIGGER_LABELS[v] ?? v;
}

export function getActionTypeLabel(v: AutomationActionType): string {
  return ACTION_LABELS[v] ?? v;
}
