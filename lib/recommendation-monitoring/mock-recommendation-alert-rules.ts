/**
 * 35단계: 알림 규칙 mock
 */

import type {
  RecommendationAlertRule,
  AlertChannel,
  AlertMetricKey,
  AlertSeverity,
} from "@/lib/types/recommendation-monitoring";
import type { RecommendationSurface } from "@/lib/types/recommendation";

const now = new Date().toISOString();

const RULES: RecommendationAlertRule[] = [
  {
    id: "rar-1",
    surface: "home",
    metricKey: "empty_feed_rate",
    comparator: "gt",
    thresholdValue: 0.15,
    severity: "warning",
    channel: "dashboard_only",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rar-2",
    surface: "home",
    metricKey: "success_rate",
    comparator: "lt",
    thresholdValue: 0.92,
    severity: "critical",
    channel: "dashboard_only",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "rar-3",
    surface: "home",
    metricKey: "fallback_active",
    comparator: "eq",
    thresholdValue: 1,
    severity: "warning",
    channel: "dashboard_only",
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

export function getRecommendationAlertRules(filters?: {
  surface?: RecommendationSurface;
  isActive?: boolean;
}): RecommendationAlertRule[] {
  let list = [...RULES];
  if (filters?.surface) list = list.filter((r) => r.surface === filters.surface);
  if (filters?.isActive !== undefined)
    list = list.filter((r) => r.isActive === filters.isActive);
  return list;
}

export function saveRecommendationAlertRule(
  input: Partial<RecommendationAlertRule> & {
    id?: string;
    surface: RecommendationSurface;
    metricKey: AlertMetricKey;
    comparator: string;
    thresholdValue: number;
    severity: AlertSeverity;
    channel: AlertChannel;
  }
): RecommendationAlertRule {
  const now = new Date().toISOString();
  const existing = input.id ? RULES.find((r) => r.id === input.id) : undefined;
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    return { ...existing };
  }
  const rule: RecommendationAlertRule = {
    id: input.id ?? `rar-${Date.now()}`,
    surface: input.surface,
    metricKey: input.metricKey,
    comparator: input.comparator as RecommendationAlertRule["comparator"],
    thresholdValue: input.thresholdValue,
    severity: input.severity,
    channel: input.channel,
    isActive: input.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  };
  RULES.push(rule);
  return rule;
}

export function setAlertRuleActive(id: string, isActive: boolean): RecommendationAlertRule | null {
  const r = RULES.find((x) => x.id === id);
  if (!r) return null;
  r.isActive = isActive;
  r.updatedAt = new Date().toISOString();
  return { ...r };
}
