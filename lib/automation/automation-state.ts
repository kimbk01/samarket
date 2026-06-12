/**
 * 운영 자동화 — 룰·실행 로그 단일 저장소.
 * 영속화: `automation-db` + `/api/admin/automation`
 */
import type {
  AutomationRule,
  AutomationTriggerType,
  AutomationActionType,
  AutomationLog,
} from "@/lib/types/automation";

function defaultAutomationRules(): AutomationRule[] {
  return [
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
}

function defaultAutomationLogs(): AutomationLog[] {
  return [
    {
      id: "al-1",
      ruleId: "ar-1",
      triggeredAt: new Date(Date.now() - 86400000).toISOString(),
      actionResult: "Slack 알림 발송 (mock)",
    },
    {
      id: "al-2",
      ruleId: "ar-2",
      triggeredAt: new Date(Date.now() - 3600000).toISOString(),
      actionResult: "Email 알림 발송 (mock)",
    },
  ];
}

const RULES: AutomationRule[] = defaultAutomationRules();
const LOGS: AutomationLog[] = defaultAutomationLogs();

export type AutomationBundleV1 = {
  version: 1;
  rules: AutomationRule[];
  logs: AutomationLog[];
};

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultAutomationBundle(): AutomationBundleV1 {
  return {
    version: 1,
    rules: defaultAutomationRules().map((r) => ({ ...r })),
    logs: defaultAutomationLogs().map((l) => ({ ...l })),
  };
}

export function importAutomationBundle(bundle: AutomationBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(RULES, (bundle.rules ?? []).map((r) => ({ ...r })));
  replaceArray(LOGS, (bundle.logs ?? []).map((l) => ({ ...l })));
  if (!RULES.length) replaceArray(RULES, defaultAutomationRules());
  if (!LOGS.length) replaceArray(LOGS, defaultAutomationLogs());
}

export function exportAutomationBundle(): AutomationBundleV1 {
  return {
    version: 1,
    rules: RULES.map((r) => ({ ...r })),
    logs: LOGS.map((l) => ({ ...l })),
  };
}

export function getAutomationRules(): AutomationRule[] {
  return [...RULES];
}

export function getAutomationRuleById(id: string): AutomationRule | undefined {
  return RULES.find((r) => r.id === id);
}

export function getAutomationLogs(filters?: { ruleId?: string }): AutomationLog[] {
  let list = [...LOGS].sort(
    (a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
  );
  if (filters?.ruleId) list = list.filter((l) => l.ruleId === filters.ruleId);
  return list;
}
