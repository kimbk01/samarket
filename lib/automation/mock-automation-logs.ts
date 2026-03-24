/**
 * 59단계: 자동화 실행 로그 mock
 */

import type { AutomationLog } from "@/lib/types/automation";

const now = new Date().toISOString();

const LOGS: AutomationLog[] = [
  { id: "al-1", ruleId: "ar-1", triggeredAt: new Date(Date.now() - 86400000).toISOString(), actionResult: "Slack 알림 발송 (mock)" },
  { id: "al-2", ruleId: "ar-2", triggeredAt: new Date(Date.now() - 3600000).toISOString(), actionResult: "Email 알림 발송 (mock)" },
];

export function getAutomationLogs(filters?: { ruleId?: string }): AutomationLog[] {
  let list = [...LOGS].sort(
    (a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
  );
  if (filters?.ruleId) list = list.filter((l) => l.ruleId === filters.ruleId);
  return list;
}
