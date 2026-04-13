/**
 * 추천 운영 설정 — 자동화 정책·Escalation·알림 규칙 단일 저장소.
 * 영속화: `recommendation-ops-db` + `/api/admin/recommendation-ops`
 */
import type { RecommendationAutomationPolicy } from "@/lib/types/recommendation-automation";
import type {
  RecommendationEscalationRule,
  EscalationChannel,
  EscalationSeverity,
  EscalationTriggerType,
} from "@/lib/types/recommendation-automation";
import type {
  RecommendationAlertRule,
  AlertChannel,
  AlertMetricKey,
  AlertSeverity,
} from "@/lib/types/recommendation-monitoring";
import type { RecommendationSurface } from "@/lib/types/recommendation";

function isoNow() {
  return new Date().toISOString();
}

const SURFACES: RecommendationSurface[] = ["home", "search", "shop"];

function defaultAutomationPolicies(): RecommendationAutomationPolicy[] {
  const t = isoNow();
  return SURFACES.map((surface) => ({
    id: `rap-${surface}`,
    surface,
    isActive: surface === "home",
    autoFallbackEnabled: true,
    autoKillSwitchEnabled: false,
    autoRollbackEnabled: true,
    autoRecoveryEnabled: true,
    dryRunEnabled: false,
    emptyFeedRateThreshold: 0.15,
    successRateThreshold: 0.92,
    ctrDropThreshold: 0.3,
    conversionDropThreshold: 0.25,
    deploymentFailureThreshold: 2,
    compareWindowMinutes: 60,
    fallbackMode: "previous_live_version",
    rollbackTargetMode: "previous_live_version",
    recoveryConditionMode: "auto_when_healthy",
    updatedAt: t,
    adminMemo: "",
  }));
}

function defaultEscalationRules(): RecommendationEscalationRule[] {
  const t = isoNow();
  return [
    {
      id: "rer-1",
      severity: "warning",
      triggerType: "empty_feed_spike",
      stepOrder: 1,
      channel: "dashboard_only",
      delayMinutes: 0,
      isActive: true,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "rer-2",
      severity: "warning",
      triggerType: "empty_feed_spike",
      stepOrder: 2,
      channel: "email",
      delayMinutes: 15,
      isActive: true,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "rer-3",
      severity: "critical",
      triggerType: "deployment_failure",
      stepOrder: 1,
      channel: "dashboard_only",
      delayMinutes: 0,
      isActive: true,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "rer-4",
      severity: "critical",
      triggerType: "deployment_failure",
      stepOrder: 2,
      channel: "slack",
      delayMinutes: 5,
      isActive: true,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "rer-5",
      severity: "critical",
      triggerType: "kill_switch_active",
      stepOrder: 1,
      channel: "admin_call",
      delayMinutes: 0,
      isActive: true,
      createdAt: t,
      updatedAt: t,
    },
  ];
}

function defaultAlertRules(): RecommendationAlertRule[] {
  const t = isoNow();
  return [
    {
      id: "rar-1",
      surface: "home",
      metricKey: "empty_feed_rate",
      comparator: "gt",
      thresholdValue: 0.15,
      severity: "warning",
      channel: "dashboard_only",
      isActive: true,
      createdAt: t,
      updatedAt: t,
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
      createdAt: t,
      updatedAt: t,
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
      createdAt: t,
      updatedAt: t,
    },
  ];
}

const AUTOMATION_POLICIES: RecommendationAutomationPolicy[] = defaultAutomationPolicies();
const ESCALATION_RULES: RecommendationEscalationRule[] = defaultEscalationRules();
const ALERT_RULES: RecommendationAlertRule[] = defaultAlertRules();

export type RecommendationOpsBundleV1 = {
  version: 1;
  automationPolicies: RecommendationAutomationPolicy[];
  escalationRules: RecommendationEscalationRule[];
  alertRules: RecommendationAlertRule[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultRecommendationOpsBundle(): RecommendationOpsBundleV1 {
  return {
    version: 1,
    automationPolicies: defaultAutomationPolicies().map((p) => ({ ...p })),
    escalationRules: defaultEscalationRules().map((r) => ({ ...r })),
    alertRules: defaultAlertRules().map((r) => ({ ...r })),
  };
}

export function importRecommendationOpsBundle(bundle: RecommendationOpsBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(AUTOMATION_POLICIES, (bundle.automationPolicies ?? []).map((p) => ({ ...p })));
  replaceArray(ESCALATION_RULES, (bundle.escalationRules ?? []).map((r) => ({ ...r })));
  replaceArray(ALERT_RULES, (bundle.alertRules ?? []).map((r) => ({ ...r })));
  if (!AUTOMATION_POLICIES.length) replaceArray(AUTOMATION_POLICIES, defaultAutomationPolicies());
  if (!ESCALATION_RULES.length) replaceArray(ESCALATION_RULES, defaultEscalationRules());
  if (!ALERT_RULES.length) replaceArray(ALERT_RULES, defaultAlertRules());
}

export function exportRecommendationOpsBundle(): RecommendationOpsBundleV1 {
  return {
    version: 1,
    automationPolicies: AUTOMATION_POLICIES.map((p) => ({ ...p })),
    escalationRules: ESCALATION_RULES.map((r) => ({ ...r })),
    alertRules: ALERT_RULES.map((r) => ({ ...r })),
  };
}

/* ─── automation policies ───────────────────────────────────── */

export function getRecommendationAutomationPolicies(
  surface?: RecommendationSurface
): RecommendationAutomationPolicy[] {
  if (surface) return AUTOMATION_POLICIES.filter((p) => p.surface === surface);
  return [...AUTOMATION_POLICIES];
}

export function getRecommendationAutomationPolicyBySurface(
  surface: RecommendationSurface
): RecommendationAutomationPolicy | undefined {
  return AUTOMATION_POLICIES.find((p) => p.surface === surface);
}

export function saveRecommendationAutomationPolicy(
  input: Partial<RecommendationAutomationPolicy> & {
    id: string;
    surface: RecommendationSurface;
  }
): RecommendationAutomationPolicy {
  const now = isoNow();
  const existing = AUTOMATION_POLICIES.find(
    (p) => p.id === input.id || p.surface === input.surface
  );
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: now });
    return { ...existing };
  }
  const policy: RecommendationAutomationPolicy = {
    id: input.id,
    surface: input.surface,
    isActive: input.isActive ?? false,
    autoFallbackEnabled: input.autoFallbackEnabled ?? false,
    autoKillSwitchEnabled: input.autoKillSwitchEnabled ?? false,
    autoRollbackEnabled: input.autoRollbackEnabled ?? false,
    autoRecoveryEnabled: input.autoRecoveryEnabled ?? false,
    dryRunEnabled: input.dryRunEnabled ?? false,
    emptyFeedRateThreshold: input.emptyFeedRateThreshold ?? 0,
    successRateThreshold: input.successRateThreshold ?? 0,
    ctrDropThreshold: input.ctrDropThreshold ?? 0,
    conversionDropThreshold: input.conversionDropThreshold ?? 0,
    deploymentFailureThreshold: input.deploymentFailureThreshold ?? 0,
    compareWindowMinutes: input.compareWindowMinutes ?? 60,
    fallbackMode: input.fallbackMode ?? "previous_live_version",
    rollbackTargetMode: input.rollbackTargetMode ?? "previous_live_version",
    recoveryConditionMode: input.recoveryConditionMode ?? "manual_only",
    updatedAt: now,
    adminMemo: input.adminMemo ?? "",
  };
  AUTOMATION_POLICIES.push(policy);
  return policy;
}

/* ─── escalation rules ──────────────────────────────────────── */

export function getRecommendationEscalationRules(filters?: {
  severity?: EscalationSeverity;
  triggerType?: EscalationTriggerType;
  isActive?: boolean;
}): RecommendationEscalationRule[] {
  let list = [...ESCALATION_RULES].sort((a, b) => a.stepOrder - b.stepOrder);
  if (filters?.severity) list = list.filter((r) => r.severity === filters.severity);
  if (filters?.triggerType) list = list.filter((r) => r.triggerType === filters.triggerType);
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
  const now = isoNow();
  const existing = input.id ? ESCALATION_RULES.find((r) => r.id === input.id) : undefined;
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
  ESCALATION_RULES.push(rule);
  return rule;
}

/* ─── alert rules (monitoring) ─────────────────────────────── */

export function getRecommendationAlertRules(filters?: {
  surface?: RecommendationSurface;
  isActive?: boolean;
}): RecommendationAlertRule[] {
  let list = [...ALERT_RULES];
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
  const now = isoNow();
  const existing = input.id ? ALERT_RULES.find((r) => r.id === input.id) : undefined;
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
  ALERT_RULES.push(rule);
  return rule;
}

export function setAlertRuleActive(id: string, isActive: boolean): RecommendationAlertRule | null {
  const r = ALERT_RULES.find((x) => x.id === id);
  if (!r) return null;
  r.isActive = isActive;
  r.updatedAt = isoNow();
  return { ...r };
}
