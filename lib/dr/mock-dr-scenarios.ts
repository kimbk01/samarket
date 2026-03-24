/**
 * 55단계: DR 시나리오 mock
 */

import type { DrScenario, DrScenarioType, DrSeverity } from "@/lib/types/dr";

const now = new Date().toISOString();

const SCENARIOS: DrScenario[] = [
  {
    id: "drs-1",
    title: "DB 연결 끊김",
    scenarioType: "db_down" as DrScenarioType,
    description: "Supabase/DB 연결 불가 시 대응",
    severity: "critical" as DrSeverity,
    createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
  },
  {
    id: "drs-2",
    title: "API 대량 5xx",
    scenarioType: "api_failure" as DrScenarioType,
    description: "API 서버 과부하·일시 장애",
    severity: "high" as DrSeverity,
    createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
  },
  {
    id: "drs-3",
    title: "인증 서비스 장애",
    scenarioType: "auth_failure" as DrScenarioType,
    description: "로그인/토큰 검증 불가",
    severity: "critical" as DrSeverity,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
];

export function getDrScenarios(filters?: {
  scenarioType?: DrScenarioType;
  severity?: DrSeverity;
}): DrScenario[] {
  let list = [...SCENARIOS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.scenarioType)
    list = list.filter((s) => s.scenarioType === filters.scenarioType);
  if (filters?.severity)
    list = list.filter((s) => s.severity === filters.severity);
  return list;
}

export function getDrScenarioById(id: string): DrScenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
