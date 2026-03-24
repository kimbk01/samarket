/**
 * 59단계: 운영 자동화 타입
 */

export type AutomationTriggerType = "error" | "latency" | "usage";

export type AutomationActionType =
  | "alert"
  | "rollback"
  | "disable_feature";

export interface AutomationRule {
  id: string;
  ruleName: string;
  triggerType: AutomationTriggerType;
  threshold: number;
  actionType: AutomationActionType;
  isActive: boolean;
}

export interface AutomationLog {
  id: string;
  ruleId: string;
  triggeredAt: string;
  actionResult: string;
}
