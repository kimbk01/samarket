/**
 * 36단계: 자동 조치 실행 이력 mock
 */

import type {
  RecommendationAutomationExecution,
  AutomationActionType,
} from "@/lib/types/recommendation-automation";
import type { RecommendationSurface } from "@/lib/types/recommendation";

const EXECUTIONS: RecommendationAutomationExecution[] = [
  {
    id: "rae-1",
    surface: "home",
    incidentId: null,
    actionType: "auto_fallback",
    executionMode: "dry_run",
    status: "skipped",
    reason: "emptyFeedRate 0.02 < threshold 0.15",
    beforeState: "normal",
    afterState: "normal",
    createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    completedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
];

export function getRecommendationAutomationExecutions(filters?: {
  surface?: RecommendationSurface;
  actionType?: AutomationActionType;
  limit?: number;
}): RecommendationAutomationExecution[] {
  let list = [...EXECUTIONS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (filters?.surface) list = list.filter((e) => e.surface === filters.surface);
  if (filters?.actionType)
    list = list.filter((e) => e.actionType === filters.actionType);
  const limit = filters?.limit ?? 100;
  return list.slice(0, limit);
}

export function addRecommendationAutomationExecution(
  input: Omit<
    RecommendationAutomationExecution,
    "id" | "createdAt" | "completedAt"
  > & { completedAt?: string | null }
): RecommendationAutomationExecution {
  const now = new Date().toISOString();
  const exec: RecommendationAutomationExecution = {
    ...input,
    id: `rae-${Date.now()}`,
    createdAt: now,
    completedAt: input.completedAt ?? now,
  };
  EXECUTIONS.unshift(exec);
  return { ...exec };
}
