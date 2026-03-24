/**
 * 34단계: 긴급 조치 로그 mock
 */

import type {
  FeedEmergencyLog,
  FeedEmergencyActionType,
  FeedSectionOverrideKey,
} from "@/lib/types/feed-emergency";
import type { RecommendationSurface } from "@/lib/types/recommendation";

const LOGS: FeedEmergencyLog[] = [];

const ACTION_LABELS: Record<FeedEmergencyActionType, string> = {
  enable_kill_switch: "킬스위치 활성화",
  disable_kill_switch: "킬스위치 해제",
  enable_fallback: "Fallback 활성화",
  disable_fallback: "Fallback 해제",
  disable_section: "섹션 비활성화",
  enable_section: "섹션 활성화",
  auto_fallback: "자동 Fallback",
  rollback_to_previous: "이전 버전 롤백",
};

export function getFeedEmergencyLogs(
  surface?: RecommendationSurface,
  limit = 100
): FeedEmergencyLog[] {
  let list = [...LOGS].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (surface) list = list.filter((l) => l.surface === surface);
  return list.slice(0, limit);
}

export function addFeedEmergencyLog(
  input: Omit<FeedEmergencyLog, "id" | "createdAt">
): FeedEmergencyLog {
  const now = new Date().toISOString();
  const log: FeedEmergencyLog = {
    ...input,
    id: `fel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
  };
  LOGS.push(log);
  return log;
}

export function getFeedEmergencyActionLabel(
  actionType: FeedEmergencyActionType
): string {
  return ACTION_LABELS[actionType] ?? actionType;
}
