/**
 * 59단계: 자동화 룰 mock
 */

import type {
  AutomationRule,
  AutomationTriggerType,
  AutomationActionType,
} from "@/lib/types/automation";

const RULES: AutomationRule[] = [
  {
    id: "ar-1",
    ruleName: "API 5xx 급증 알림",
    triggerType: "error" as AutomationTriggerType,
    threshold: 10,
    actionType: "alert" as AutomationActionType,
    isActive: true,
  },
  {
    id: "ar-2",
    ruleName: "평균 지연 2초 초과 시 알림",
    triggerType: "latency" as AutomationTriggerType,
    threshold: 2000,
    actionType: "alert" as AutomationActionType,
    isActive: true,
  },
  {
    id: "ar-3",
    ruleName: "DB 사용량 90% 초과 시 알림",
    triggerType: "usage" as AutomationTriggerType,
    threshold: 90,
    actionType: "alert" as AutomationActionType,
    isActive: false,
  },
];

export function getAutomationRules(): AutomationRule[] {
  return [...RULES];
}

export function getAutomationRuleById(id: string): AutomationRule | undefined {
  return RULES.find((r) => r.id === id);
}
