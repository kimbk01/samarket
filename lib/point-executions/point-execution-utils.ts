/**
 * 25단계: 포인트 실행 유틸 (라벨, 키 생성, 필터)
 */

import type {
  PointRewardActionType,
  PointRewardExecutionStatus,
  PointRewardExecution,
  PointReclaimTriggerType,
  PointReclaimMode,
  PointRewardLogActionType,
} from "@/lib/types/point-execution";

export type { PointRewardActionType, PointRewardExecutionStatus } from "@/lib/types/point-execution";

export function buildExecutionKey(
  boardKey: string,
  actionType: PointRewardActionType,
  targetId: string,
  userId: string
): string {
  return `${boardKey}:${actionType}:${targetId}:${userId}`;
}

export const POINT_REWARD_ACTION_LABELS: Record<PointRewardActionType, string> = {
  write: "글쓰기",
  comment: "댓글",
};

export const POINT_EXECUTION_STATUS_LABELS: Record<
  PointRewardExecutionStatus,
  string
> = {
  success: "지급완료",
  blocked: "차단",
  reversed: "회수됨",
};

export const POINT_RECLAIM_TRIGGER_LABELS: Record<
  PointReclaimTriggerType,
  string
> = {
  delete: "삭제",
  admin_remove: "관리자삭제",
  report_confirmed: "신고적중",
};

export const POINT_RECLAIM_MODE_LABELS: Record<PointReclaimMode, string> = {
  full: "전액",
  partial: "일부",
};

export const POINT_REWARD_LOG_ACTION_LABELS: Record<
  PointRewardLogActionType,
  string
> = {
  reward: "지급",
  reclaim: "회수",
};

export const EXECUTION_STATUS_OPTIONS: {
  value: PointRewardExecutionStatus | "";
  label: string;
}[] = [
  { value: "", label: "전체" },
  { value: "success", label: "지급완료" },
  { value: "blocked", label: "차단" },
  { value: "reversed", label: "회수됨" },
];

export interface AdminPointExecutionFilters {
  status: PointRewardExecutionStatus | "";
  boardKey: string;
  actionType: PointRewardActionType | "";
  userId: string;
}

export function filterPointRewardExecutions<T extends PointRewardExecution>(
  list: T[],
  filters: AdminPointExecutionFilters
): T[] {
  return list.filter((e) => {
    if (filters.status && e.status !== filters.status) return false;
    if (filters.boardKey && e.boardKey !== filters.boardKey) return false;
    if (filters.actionType && e.actionType !== filters.actionType) return false;
    if (filters.userId && e.userId !== filters.userId) return false;
    return true;
  });
}
