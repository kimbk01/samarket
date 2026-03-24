/**
 * 36단계: 알림 escalation 규칙 mock
 */

import type {
  RecommendationEscalationRule,
  EscalationChannel,
  EscalationSeverity,
  EscalationTriggerType,
} from "@/lib/types/recommendation-automation";

const now = new Date().toISOString();

const RULES: RecommendationEscalationRule[] = [
  {
    id: "rer-1",
    severity: "warning",
    triggerType: "empty_feed_spike",
    stepOrder: 1,
    channel: "dashboard_only",
    delayMinutes: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rer-2",
    severity: "warning",
    triggerType: "empty_feed_spike",
    stepOrder: 2,
    channel: "email",
    delayMinutes: 15,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rer-3",
    severity: "critical",
    triggerType: "deployment_failure",
    stepOrder: 1,
    channel: "dashboard_only",
    delayMinutes: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rer-4",
    severity: "critical",
    triggerType: "deployment_failure",
    stepOrder: 2,
    channel: "slack",
    delayMinutes: 5,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rer-5",
    severity: "critical",
    triggerType: "kill_switch_active",
    stepOrder: 1,
    channel: "admin_call",
    delayMinutes: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

export function getRecommendationEscalationRules(filters?: {
  severity?: EscalationSeverity;
  triggerType?: EscalationTriggerType;
  isActive?: boolean;
}): RecommendationEscalationRule[] {
  let list = [...RULES].sort((a, b) => a.stepOrder - b.stepOrder);
  if (filters?.severity) list = list.filter((r) => r.severity === filters.severity);
  if (filters?.triggerType)
    list = list.filter((r) => r.triggerType === filters.triggerType);
  if (filters?.isActive !== undefined)
    list = list.filter((r) => r.isActive === filters.isActive);
  return list;
}

export function saveRecommendationEscalationRule(
  input: Partial<RecommendationEscalationRule> & {
    severity: EscalationSeverity;
    triggerType: EscalationTriggerType;
    stepOrder: number;
    channel: EscalationChannel;
  }
): RecommendationEscalationRule {
  const now = new Date().toISOString();
  const existing = input.id ? RULES.find((r) => r.id === input.id) : undefined;
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    return { ...existing };
  }
  const rule: RecommendationEscalationRule = {
    id: input.id ?? `rer-${Date.now()}`,
    severity: input.severity,
    triggerType: input.triggerType,
    stepOrder: input.stepOrder,
    channel: input.channel,
    delayMinutes: input.delayMinutes ?? 0,
    isActive: input.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  };
  RULES.push(rule);
  return rule;
}
